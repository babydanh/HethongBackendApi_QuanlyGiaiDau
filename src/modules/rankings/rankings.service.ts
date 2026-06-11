import { Injectable, BadRequestException } from '@nestjs/common';
import { RankingsRepository } from './rankings.repository';
import { EloEngineService } from './elo-engine.service';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';
import * as schema from '../../database/schema';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';

@Injectable()
export class RankingsService {
  constructor(
    private readonly rankingsRepository: RankingsRepository,
    private readonly eloEngineService: EloEngineService,
  ) {}

  async getLeaderboard(query: QueryRankingDto) {
    return this.rankingsRepository.getLeaderboard(query);
  }

  async getUserRankings(userId: string) {
    return this.rankingsRepository.getUserRankings(userId);
  }

  async getEloHistory(
    userId: string,
    query: {
      categoryId?: string;
      scope?: 'PUBLIC' | 'COMMUNITY';
      communityId?: string;
      page?: number;
      limit?: number;
    },
  ) {
    return this.rankingsRepository.getEloHistory(userId, query);
  }

  // Recalculate ELO for a single match manually (via Admin Endpoint)
  async updateMatchElo(dto: UpdateEloDto) {
    const db = this.rankingsRepository.getDbInstance();
    const scope = dto.communityId ? 'COMMUNITY' : 'PUBLIC';
    
    return await db.transaction(async (tx) => {
      // 1. Lock records
      const winnerRank = await this.rankingsRepository.getOrCreateUserRank(
        tx,
        dto.winnerId,
        dto.categoryId,
        dto.matchType,
        scope,
        dto.communityId,
        true,
      );
      const loserRank = await this.rankingsRepository.getOrCreateUserRank(
        tx,
        dto.loserId,
        dto.categoryId,
        dto.matchType,
        scope,
        dto.communityId,
        true,
      );

      // 2. Calculate ELO
      const winnerResult = this.eloEngineService.calculateElo(
        winnerRank.eloPoints,
        loserRank.eloPoints,
        true,
        winnerRank.matchesPlayed,
        winnerRank.winStreak,
      );

      const loserResult = this.eloEngineService.calculateElo(
        loserRank.eloPoints,
        winnerRank.eloPoints,
        false,
        loserRank.matchesPlayed,
        loserRank.winStreak,
      );

      // 3. Update ranks
      await this.rankingsRepository.updateUserRank(
        tx,
        winnerRank.id,
        {
          eloPoints: winnerResult.newElo,
          matchesPlayed: winnerRank.matchesPlayed + 1,
          matchesWon: winnerRank.matchesWon + 1,
          winStreak: winnerResult.newWinStreak,
        },
        scope,
      );

      await this.rankingsRepository.updateUserRank(
        tx,
        loserRank.id,
        {
          eloPoints: loserResult.newElo,
          matchesPlayed: loserRank.matchesPlayed + 1,
          matchesWon: loserRank.matchesWon,
          winStreak: 0,
        },
        scope,
      );

      if (scope === 'PUBLIC') {
        await this.recalculateUserRankTier(tx, dto.winnerId, dto.categoryId, dto.matchType);
        await this.recalculateUserRankTier(tx, dto.loserId, dto.categoryId, dto.matchType);
      }

      // 4. Record history
      await this.rankingsRepository.insertEloHistory(tx, [
        {
          userId: dto.winnerId,
          categoryId: dto.categoryId,
          matchId: dto.matchId,
          reason: 'MATCH_WIN',
          previousElo: winnerRank.eloPoints,
          newElo: winnerResult.newElo,
          changedPoints: winnerResult.changedPoints,
        },
        {
          userId: dto.loserId,
          categoryId: dto.categoryId,
          matchId: dto.matchId,
          reason: 'MATCH_LOSS',
          previousElo: loserRank.eloPoints,
          newElo: loserResult.newElo,
          changedPoints: loserResult.changedPoints,
        },
      ]);

      return {
        winner: winnerResult,
        loser: loserResult,
      };
    });
  }

  // Automatic match result processor
  async processMatchResult(
    matchId: string,
    winnerParticipantId: string,
    loserParticipantId: string,
    categoryId: string,
    matchType: string,
    scope: 'PUBLIC' | 'COMMUNITY',
    communityId?: string,
  ) {
    const db = this.rankingsRepository.getDbInstance();

    // 1. Fetch rosters
    const winnerRosters = await db
      .select({ userId: schema.tournamentRosters.userId })
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, winnerParticipantId));

    const loserRosters = await db
      .select({ userId: schema.tournamentRosters.userId })
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, loserParticipantId));

    if (winnerRosters.length === 0 || loserRosters.length === 0) {
      throw new BadRequestException('Winner or Loser team has no players registered.');
    }

    const winnerUserIds = winnerRosters.map((r) => r.userId);
    const loserUserIds = loserRosters.map((r) => r.userId);

    return await db.transaction(async (tx) => {
      // 2. Fetch and Lock existing rank records for all players
      type UserRank = typeof schema.userRanks.$inferSelect | typeof schema.communityRankings.$inferSelect;
      const winnerRanks: UserRank[] = [];
      for (const userId of winnerUserIds) {
        const rank = await this.rankingsRepository.getOrCreateUserRank(
          tx,
          userId,
          categoryId,
          matchType,
          scope,
          communityId,
          true, // Lock for update!
        );
        winnerRanks.push(rank);
      }

      const loserRanks: UserRank[] = [];
      for (const userId of loserUserIds) {
        const rank = await this.rankingsRepository.getOrCreateUserRank(
          tx,
          userId,
          categoryId,
          matchType,
          scope,
          communityId,
          true, // Lock for update!
        );
        loserRanks.push(rank);
      }

      // 3. Calculate team ELO averages
      const avgWinnerElo = winnerRanks.reduce((sum, r) => sum + r.eloPoints, 0) / winnerRanks.length;
      const avgLoserElo = loserRanks.reduce((sum, r) => sum + r.eloPoints, 0) / loserRanks.length;

      const logs: (typeof schema.eloHistoryLogs.$inferInsert)[] = [];

      // 4. Update Winners
      for (const rank of winnerRanks) {
        const result = this.eloEngineService.calculateElo(
          rank.eloPoints,
          avgLoserElo,
          true,
          rank.matchesPlayed,
          rank.winStreak,
        );

        await this.rankingsRepository.updateUserRank(
          tx,
          rank.id,
          {
            eloPoints: result.newElo,
            matchesPlayed: rank.matchesPlayed + 1,
            matchesWon: rank.matchesWon + 1,
            winStreak: result.newWinStreak,
          },
          scope,
        );

        logs.push({
          userId: rank.userId,
          categoryId,
          matchId,
          reason: 'MATCH_WIN',
          previousElo: rank.eloPoints,
          newElo: result.newElo,
          changedPoints: result.changedPoints,
        });
      }

      // 5. Update Losers
      for (const rank of loserRanks) {
        const result = this.eloEngineService.calculateElo(
          rank.eloPoints,
          avgWinnerElo,
          false,
          rank.matchesPlayed,
          rank.winStreak,
        );

        await this.rankingsRepository.updateUserRank(
          tx,
          rank.id,
          {
            eloPoints: result.newElo,
            matchesPlayed: rank.matchesPlayed + 1,
            matchesWon: rank.matchesWon,
            winStreak: 0,
          },
          scope,
        );

        logs.push({
          userId: rank.userId,
          categoryId,
          matchId,
          reason: 'MATCH_LOSS',
          previousElo: rank.eloPoints,
          newElo: result.newElo,
          changedPoints: result.changedPoints,
        });
      }

      // 6. Insert history logs
      await this.rankingsRepository.insertEloHistory(tx, logs);

      if (scope === 'PUBLIC') {
        for (const userId of winnerUserIds) {
          await this.recalculateUserRankTier(tx, userId, categoryId, matchType);
        }
        for (const userId of loserUserIds) {
          await this.recalculateUserRankTier(tx, userId, categoryId, matchType);
        }
      }

      return {
        success: true,
        winnerPlayerCount: winnerRanks.length,
        loserPlayerCount: loserRanks.length,
      };
    });
  }

  async recalculateUserRankTier(
    tx: any,
    userId: string,
    categoryId: string,
    matchType: string,
  ) {
    const rank = await tx
      .select()
      .from(schema.userRanks)
      .where(
        and(
          eq(schema.userRanks.userId, userId),
          eq(schema.userRanks.categoryId, categoryId),
          eq(schema.userRanks.matchType, matchType),
          isNull(schema.userRanks.communityId),
        ),
      )
      .limit(1)
      .then((rows: any) => rows[0]);

    if (!rank) return;

    const profile = await tx
      .select({ provinceCode: schema.profiles.provinceCode })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1)
      .then((rows: any) => rows[0]);
    const provinceCode = profile?.provinceCode || null;

    const tiers = await tx
      .select()
      .from(schema.eloTiers)
      .where(eq(schema.eloTiers.categoryId, categoryId));

    const tierDLow = tiers.find((t: any) => t.name === 'Tier D (Low)');
    const tierDHigh = tiers.find((t: any) => t.name === 'Tier D (High)');
    const tierCLow = tiers.find((t: any) => t.name === 'Tier C (Low)');
    const tierCHigh = tiers.find((t: any) => t.name === 'Tier C (High)');
    const tierB = tiers.find((t: any) => t.name === 'Tier B');
    const tierA = tiers.find((t: any) => t.name === 'Tier A');
    const tierS = tiers.find((t: any) => t.name === 'Tier S');

    if (rank.eloPoints >= 2200 && provinceCode) {
      const topRanks = await tx
        .select({
          rankId: schema.userRanks.id,
          userId: schema.userRanks.userId,
          eloPoints: schema.userRanks.eloPoints,
          updatedAt: schema.userRanks.updatedAt,
        })
        .from(schema.userRanks)
        .innerJoin(
          schema.profiles,
          eq(schema.userRanks.userId, schema.profiles.userId),
        )
        .where(
          and(
            eq(schema.userRanks.categoryId, categoryId),
            eq(schema.userRanks.matchType, matchType),
            isNull(schema.userRanks.communityId),
            eq(schema.profiles.provinceCode, provinceCode),
            sql`${schema.userRanks.eloPoints} >= 2200`,
          ),
        )
        .orderBy(desc(schema.userRanks.eloPoints), schema.userRanks.updatedAt);

      if (topRanks.length > 0) {
        const topRank = topRanks[0];
        if (tierS) {
          await tx
            .update(schema.userRanks)
            .set({ tierId: tierS.id })
            .where(eq(schema.userRanks.id, topRank.rankId));
        }

        for (let i = 1; i < topRanks.length; i++) {
          if (tierA) {
            await tx
              .update(schema.userRanks)
              .set({ tierId: tierA.id })
              .where(eq(schema.userRanks.id, topRanks[i].rankId));
          }
        }
      }
    } else {
      const elo = rank.eloPoints;
      let targetTier: any = null;

      if (elo >= 1900 && tierA) targetTier = tierA;
      else if (elo >= 1700 && tierB) targetTier = tierB;
      else if (elo >= 1500 && tierCHigh) targetTier = tierCHigh;
      else if (elo >= 1300 && tierCLow) targetTier = tierCLow;
      else if (elo >= 1100 && tierDHigh) targetTier = tierDHigh;
      else if (tierDLow) targetTier = tierDLow;

      await tx
        .update(schema.userRanks)
        .set({ tierId: targetTier ? targetTier.id : null })
        .where(eq(schema.userRanks.id, rank.id));

      if (provinceCode) {
        const otherTopRanks = await tx
          .select({
            rankId: schema.userRanks.id,
            eloPoints: schema.userRanks.eloPoints,
          })
          .from(schema.userRanks)
          .innerJoin(
            schema.profiles,
            eq(schema.userRanks.userId, schema.profiles.userId),
          )
          .where(
            and(
              eq(schema.userRanks.categoryId, categoryId),
              eq(schema.userRanks.matchType, matchType),
              isNull(schema.userRanks.communityId),
              eq(schema.profiles.provinceCode, provinceCode),
              sql`${schema.userRanks.eloPoints} >= 2200`,
            ),
          )
          .orderBy(desc(schema.userRanks.eloPoints), schema.userRanks.updatedAt)
          .limit(1);

        if (otherTopRanks.length > 0 && tierS) {
          await tx
            .update(schema.userRanks)
            .set({ tierId: tierS.id })
            .where(eq(schema.userRanks.id, otherTopRanks[0].rankId));
        }
      }
    }
  }

  async recalculateUserTiersOnProvinceChange(userId: string) {
    const db = this.rankingsRepository.getDbInstance();
    const ranks = await db
      .select()
      .from(schema.userRanks)
      .where(
        and(
          eq(schema.userRanks.userId, userId),
          isNull(schema.userRanks.communityId),
        ),
      );

    await db.transaction(async (tx) => {
      for (const rank of ranks) {
        await this.recalculateUserRankTier(
          tx,
          userId,
          rank.categoryId,
          rank.matchType,
        );
      }
    });
  }
}
