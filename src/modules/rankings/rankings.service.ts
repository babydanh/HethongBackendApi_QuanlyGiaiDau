import { Injectable, BadRequestException } from '@nestjs/common';
import { RankingsRepository } from './rankings.repository';
import { EloEngineService } from './elo-engine.service';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';
import * as schema from '../../database/schema';
import { eq, and, isNull, desc, sql, or, asc } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

type Transaction = Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0];

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

      // 3. Update ranks with shield logic
      const boundaries = [1100, 1200, 1300, 1500, 1700, 1800];
      
      let isWinnerShieldActive = false;
      if (scope === 'PUBLIC') {
        const publicWinnerRank = winnerRank as typeof schema.userRanks.$inferSelect;
        isWinnerShieldActive = !!publicWinnerRank.shieldActive;
        for (const boundary of boundaries) {
          if (winnerRank.eloPoints < boundary && winnerResult.newElo >= boundary) {
            isWinnerShieldActive = true;
          }
        }
      }

      let finalLoserElo = loserResult.newElo;
      let isLoserShieldActive = false;
      if (scope === 'PUBLIC') {
        const publicLoserRank = loserRank as typeof schema.userRanks.$inferSelect;
        isLoserShieldActive = !!publicLoserRank.shieldActive;
        for (const boundary of boundaries) {
          if (loserRank.eloPoints >= boundary && loserResult.newElo < boundary) {
            if (publicLoserRank.shieldActive) {
              finalLoserElo = boundary;
              isLoserShieldActive = false; // shield broken
              break;
            }
          }
        }
      }

      await this.rankingsRepository.updateUserRank(
        tx,
        winnerRank.id,
        {
          eloPoints: winnerResult.newElo,
          matchesPlayed: winnerRank.matchesPlayed + 1,
          matchesWon: winnerRank.matchesWon + 1,
          winStreak: winnerResult.newWinStreak,
          shieldActive: isWinnerShieldActive,
        },
        scope,
      );

      await this.rankingsRepository.updateUserRank(
        tx,
        loserRank.id,
        {
          eloPoints: finalLoserElo,
          matchesPlayed: loserRank.matchesPlayed + 1,
          matchesWon: loserRank.matchesWon,
          winStreak: 0,
          shieldActive: isLoserShieldActive,
        },
        scope,
      );

      if (scope === 'PUBLIC') {
        await this.recalculateUserRankTier(tx, dto.winnerId, dto.categoryId, dto.matchType);
        await this.recalculateUserRankTier(tx, dto.loserId, dto.categoryId, dto.matchType);
      }

      // 4. Record history
      const adjustedLoserChangedPoints = finalLoserElo - loserRank.eloPoints;
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
          newElo: finalLoserElo,
          changedPoints: adjustedLoserChangedPoints,
        },
      ]);

      return {
        winner: winnerResult,
        loser: {
          ...loserResult,
          newElo: finalLoserElo,
          changedPoints: adjustedLoserChangedPoints,
        },
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

        const boundaries = [1100, 1200, 1300, 1500, 1700, 1800];
        let isWinnerShieldActive = false;
        if (scope === 'PUBLIC') {
          isWinnerShieldActive = !!(rank as typeof schema.userRanks.$inferSelect).shieldActive;
          for (const boundary of boundaries) {
            if (rank.eloPoints < boundary && result.newElo >= boundary) {
              isWinnerShieldActive = true;
            }
          }
        }

        await this.rankingsRepository.updateUserRank(
          tx,
          rank.id,
          {
            eloPoints: result.newElo,
            matchesPlayed: rank.matchesPlayed + 1,
            matchesWon: rank.matchesWon + 1,
            winStreak: result.newWinStreak,
            shieldActive: isWinnerShieldActive,
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

        const boundaries = [1100, 1200, 1300, 1500, 1700, 1800];
        let finalLoserElo = result.newElo;
        let isLoserShieldActive = false;
        if (scope === 'PUBLIC') {
          const publicRank = rank as typeof schema.userRanks.$inferSelect;
          isLoserShieldActive = !!publicRank.shieldActive;
          for (const boundary of boundaries) {
            if (rank.eloPoints >= boundary && result.newElo < boundary) {
              if (publicRank.shieldActive) {
                finalLoserElo = boundary;
                isLoserShieldActive = false; // shield broken
                break;
              }
            }
          }
        }

        await this.rankingsRepository.updateUserRank(
          tx,
          rank.id,
          {
            eloPoints: finalLoserElo,
            matchesPlayed: rank.matchesPlayed + 1,
            matchesWon: rank.matchesWon,
            winStreak: 0,
            shieldActive: isLoserShieldActive,
          },
          scope,
        );

        logs.push({
          userId: rank.userId,
          categoryId,
          matchId,
          reason: 'MATCH_LOSS',
          previousElo: rank.eloPoints,
          newElo: finalLoserElo,
          changedPoints: finalLoserElo - rank.eloPoints,
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
    tx: Transaction,
    userId: string,
    categoryId: string,
    matchType: string,
  ) {
    const tiers = await tx
      .select()
      .from(schema.eloTiers)
      .where(eq(schema.eloTiers.categoryId, categoryId));

    const tierDLow = tiers.find((t) => t.name === 'Tier D (Low)');
    const tierDHigh = tiers.find((t) => t.name === 'Tier D (High)');
    const tierCLow = tiers.find((t) => t.name === 'Tier C (Low)');
    const tierCHigh = tiers.find((t) => t.name === 'Tier C (High)');
    const tierBLow = tiers.find((t) => t.name === 'Tier B (Low)');
    const tierBHigh = tiers.find((t) => t.name === 'Tier B (High)');
    const tierALow = tiers.find((t) => t.name === 'Tier A (Low)');
    const tierAHigh = tiers.find((t) => t.name === 'Tier A (High)');
    const tierS = tiers.find((t) => t.name === 'Tier S');

    // 1. Find the top 1 global player for S-Rank validation (only 1 user can be Tier S)
    const [topRank] = await tx
      .select({
        id: schema.userRanks.id,
        userId: schema.userRanks.userId,
        eloPoints: schema.userRanks.eloPoints,
      })
      .from(schema.userRanks)
      .where(
        and(
          eq(schema.userRanks.categoryId, categoryId),
          eq(schema.userRanks.matchType, matchType),
          isNull(schema.userRanks.communityId),
        ),
      )
      .orderBy(desc(schema.userRanks.eloPoints), schema.userRanks.updatedAt)
      .limit(1);

    // 2. Identify Tier S user
    const tierSUserId = (topRank && topRank.eloPoints >= 1800) ? topRank.userId : null;

    // 3. Update all Tier S assignments
    if (tierS) {
      if (tierSUserId) {
        // Assign Tier S to top player
        await tx
          .update(schema.userRanks)
          .set({ tierId: tierS.id })
          .where(eq(schema.userRanks.userId, tierSUserId));

        // Downgrade any other player currently holding Tier S to Tier A (High)
        await tx
          .update(schema.userRanks)
          .set({ tierId: tierAHigh ? tierAHigh.id : null })
          .where(
            and(
              eq(schema.userRanks.categoryId, categoryId),
              eq(schema.userRanks.matchType, matchType),
              isNull(schema.userRanks.communityId),
              eq(schema.userRanks.tierId, tierS.id),
              sql`${schema.userRanks.userId} != ${tierSUserId}`
            )
          );
      } else {
        // Nobody is Tier S, downgrade anyone holding it to Tier A (High)
        await tx
          .update(schema.userRanks)
          .set({ tierId: tierAHigh ? tierAHigh.id : null })
          .where(
            and(
              eq(schema.userRanks.categoryId, categoryId),
              eq(schema.userRanks.matchType, matchType),
              isNull(schema.userRanks.communityId),
              eq(schema.userRanks.tierId, tierS.id)
            )
          );
      }
    }

    // 4. Calculate for the target user (if they are not the Tier S user)
    if (userId !== tierSUserId) {
      const [rank] = await tx
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
        .limit(1);

      if (rank) {
        const elo = rank.eloPoints;
        let targetTier: typeof schema.eloTiers.$inferSelect | null = null;

        if (elo >= 1700 && tierAHigh) targetTier = tierAHigh;
        else if (elo >= 1600 && tierALow) targetTier = tierALow;
        else if (elo >= 1500 && tierBHigh) targetTier = tierBHigh;
        else if (elo >= 1400 && tierBLow) targetTier = tierBLow;
        else if (elo >= 1300 && tierCHigh) targetTier = tierCHigh;
        else if (elo >= 1200 && tierCLow) targetTier = tierCLow;
        else if (elo >= 1100 && tierDHigh) targetTier = tierDHigh;
        else if (tierDLow) targetTier = tierDLow;

        await tx
          .update(schema.userRanks)
          .set({ tierId: targetTier ? targetTier.id : null })
          .where(eq(schema.userRanks.id, rank.id));
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

  async recalculateEloChain(
    tx: Transaction,
    playerIds: string[],
    fromTime: Date,
    categoryId: string,
    matchType: string,
  ) {
    const subsequentMatches = await tx
      .select({
        match: schema.matches,
        stage: schema.tournamentStages,
        tournament: schema.tournaments,
      })
      .from(schema.matches)
      .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
      .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
      .innerJoin(schema.tournaments, eq(schema.tournamentStages.tournamentId, schema.tournaments.id))
      .innerJoin(schema.tournamentRosters, or(
         eq(schema.matches.participant1Id, schema.tournamentRosters.participantId),
         eq(schema.matches.participant2Id, schema.tournamentRosters.participantId)
      ))
      .where(
        and(
          eq(schema.tournaments.categoryId, categoryId),
          eq(schema.tournaments.matchType, matchType),
          eq(schema.matches.status, 'COMPLETED'),
          sql`${schema.matches.completedAt} >= ${fromTime}`
        )
      )
      .orderBy(asc(schema.matches.completedAt));

    const uniqueMatchIds = new Set<string>();
    const matchesToRecalculate: typeof subsequentMatches = [];
    for (const m of subsequentMatches) {
      if (!uniqueMatchIds.has(m.match.id)) {
        uniqueMatchIds.add(m.match.id);
        matchesToRecalculate.push(m);
      }
    }

    const affectedPlayers = new Set<string>(playerIds);
    const playerStates = new Map<string, {
      elo: number;
      matchesPlayed: number;
      matchesWon: number;
      winStreak: number;
      shieldActive: boolean;
    }>();

    const getPlayerState = async (userId: string, completedAt: Date) => {
      if (playerStates.has(userId)) {
        return playerStates.get(userId)!;
      }

      const [lastLog] = await tx
        .select()
        .from(schema.eloHistoryLogs)
        .where(
          and(
            eq(schema.eloHistoryLogs.userId, userId),
            eq(schema.eloHistoryLogs.categoryId, categoryId),
            sql`${schema.eloHistoryLogs.createdAt} < ${completedAt}`
          )
        )
        .orderBy(desc(schema.eloHistoryLogs.createdAt))
        .limit(1);

      const startingElo = lastLog?.newElo ?? 1000;

      const playedRes = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.matches)
        .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
        .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
        .innerJoin(schema.tournaments, eq(schema.tournamentStages.tournamentId, schema.tournaments.id))
        .innerJoin(schema.tournamentRosters, or(
          eq(schema.matches.participant1Id, schema.tournamentRosters.participantId),
          eq(schema.matches.participant2Id, schema.tournamentRosters.participantId)
        ))
        .where(
          and(
            eq(schema.tournamentRosters.userId, userId),
            eq(schema.tournaments.categoryId, categoryId),
            eq(schema.tournaments.matchType, matchType),
            eq(schema.matches.status, 'COMPLETED'),
            sql`${schema.matches.completedAt} < ${completedAt}`
          )
        );
      const matchesPlayed = Number(playedRes[0]?.count || 0);

      const wonRes = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.matches)
        .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
        .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
        .innerJoin(schema.tournaments, eq(schema.tournamentStages.tournamentId, schema.tournaments.id))
        .innerJoin(schema.tournamentRosters, eq(schema.matches.winnerId, schema.tournamentRosters.participantId))
        .where(
          and(
            eq(schema.tournamentRosters.userId, userId),
            eq(schema.tournaments.categoryId, categoryId),
            eq(schema.tournaments.matchType, matchType),
            eq(schema.matches.status, 'COMPLETED'),
            sql`${schema.matches.completedAt} < ${completedAt}`
          )
        );
      const matchesWon = Number(wonRes[0]?.count || 0);

      const priorMatches = await tx
        .select({
          winnerId: schema.matches.winnerId,
          p1Id: schema.matches.participant1Id,
          p2Id: schema.matches.participant2Id,
          participantId: schema.tournamentRosters.participantId
        })
        .from(schema.matches)
        .innerJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
        .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
        .innerJoin(schema.tournaments, eq(schema.tournamentStages.tournamentId, schema.tournaments.id))
        .innerJoin(schema.tournamentRosters, or(
          eq(schema.matches.participant1Id, schema.tournamentRosters.participantId),
          eq(schema.matches.participant2Id, schema.tournamentRosters.participantId)
        ))
        .where(
          and(
            eq(schema.tournamentRosters.userId, userId),
            eq(schema.tournaments.categoryId, categoryId),
            eq(schema.tournaments.matchType, matchType),
            eq(schema.matches.status, 'COMPLETED'),
            sql`${schema.matches.completedAt} < ${completedAt}`
          )
        )
        .orderBy(desc(schema.matches.completedAt));

      let winStreak = 0;
      for (const pm of priorMatches) {
        if (pm.winnerId === pm.participantId) {
          winStreak++;
        } else {
          break;
        }
      }

      let shieldActive = false;
      if (lastLog) {
        const prev = lastLog.previousElo;
        const curr = lastLog.newElo;
        const boundaries = [1100, 1200, 1300, 1500, 1700, 1800];
        for (const boundary of boundaries) {
          if (prev < boundary && curr >= boundary) {
            shieldActive = true;
          }
        }
      }

      const state = { elo: startingElo, matchesPlayed, matchesWon, winStreak, shieldActive };
      playerStates.set(userId, state);
      return state;
    };

    for (const item of matchesToRecalculate) {
      const match = item.match;
      const completedAt = match.completedAt || match.updatedAt;

      const p1Id = match.participant1Id;
      const p2Id = match.participant2Id;
      if (!p1Id || !p2Id || !match.winnerId) continue;

      const winnerParticipantId = match.winnerId;

      const winnerRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, winnerParticipantId));

      const loserParticipantId = winnerParticipantId === p1Id ? p2Id : p1Id;
      const loserRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, loserParticipantId));

      const winnerUserIds: string[] = winnerRosters.map(r => r.userId);
      const loserUserIds: string[] = loserRosters.map(r => r.userId);

      const isMatchAffected = [...winnerUserIds, ...loserUserIds].some(uid => affectedPlayers.has(uid));
      if (!isMatchAffected) continue;

      for (const uid of [...winnerUserIds, ...loserUserIds]) {
        await getPlayerState(uid, completedAt);
      }

      const winnerStates = winnerUserIds.map(uid => playerStates.get(uid)!);
      const loserStates = loserUserIds.map(uid => playerStates.get(uid)!);

      const avgWinnerElo = winnerStates.reduce((sum, s) => sum + s.elo, 0) / winnerStates.length;
      const avgLoserElo = loserStates.reduce((sum, s) => sum + s.elo, 0) / loserStates.length;

      for (let i = 0; i < winnerUserIds.length; i++) {
        const uid = winnerUserIds[i];
        const state = winnerStates[i];

        const result = this.eloEngineService.calculateElo(
          state.elo,
          avgLoserElo,
          true,
          state.matchesPlayed,
          state.winStreak
        );

        const boundaries = [1100, 1200, 1300, 1500, 1700, 1800];
        let isWinnerShieldActive = state.shieldActive;
        for (const boundary of boundaries) {
          if (state.elo < boundary && result.newElo >= boundary) {
            isWinnerShieldActive = true;
          }
        }

        await tx
          .delete(schema.eloHistoryLogs)
          .where(
            and(
              eq(schema.eloHistoryLogs.matchId, match.id),
              eq(schema.eloHistoryLogs.userId, uid)
            )
          );

        await tx.insert(schema.eloHistoryLogs).values({
          userId: uid,
          categoryId,
          matchId: match.id,
          reason: 'MATCH_WIN',
          previousElo: state.elo,
          newElo: result.newElo,
          changedPoints: result.changedPoints,
          createdAt: completedAt,
        });

        state.elo = result.newElo;
        state.matchesPlayed += 1;
        state.matchesWon += 1;
        state.winStreak = result.newWinStreak;
        state.shieldActive = isWinnerShieldActive;

        affectedPlayers.add(uid);
      }

      for (let i = 0; i < loserUserIds.length; i++) {
        const uid = loserUserIds[i];
        const state = loserStates[i];

        const result = this.eloEngineService.calculateElo(
          state.elo,
          avgWinnerElo,
          false,
          state.matchesPlayed,
          state.winStreak
        );

        const boundaries = [1100, 1200, 1300, 1500, 1700, 1800];
        let finalLoserElo = result.newElo;
        let isLoserShieldActive = state.shieldActive;
        for (const boundary of boundaries) {
          if (state.elo >= boundary && result.newElo < boundary) {
            if (state.shieldActive) {
              finalLoserElo = boundary;
              isLoserShieldActive = false;
              break;
            }
          }
        }

        await tx
          .delete(schema.eloHistoryLogs)
          .where(
            and(
              eq(schema.eloHistoryLogs.matchId, match.id),
              eq(schema.eloHistoryLogs.userId, uid)
            )
          );

        await tx.insert(schema.eloHistoryLogs).values({
          userId: uid,
          categoryId,
          matchId: match.id,
          reason: 'MATCH_LOSS',
          previousElo: state.elo,
          newElo: finalLoserElo,
          changedPoints: finalLoserElo - state.elo,
          createdAt: completedAt,
        });

        state.elo = finalLoserElo;
        state.matchesPlayed += 1;
        state.winStreak = 0;
        state.shieldActive = isLoserShieldActive;

        affectedPlayers.add(uid);
      }
    }

    for (const [uid, state] of playerStates.entries()) {
      await tx
        .update(schema.userRanks)
        .set({
          eloPoints: state.elo,
          matchesPlayed: state.matchesPlayed,
          matchesWon: state.matchesWon,
          winStreak: state.winStreak,
          shieldActive: state.shieldActive,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.userRanks.userId, uid),
            eq(schema.userRanks.categoryId, categoryId),
            eq(schema.userRanks.matchType, matchType),
            isNull(schema.userRanks.communityId)
          )
        );

      await this.recalculateUserRankTier(tx, uid, categoryId, matchType);
    }
  }
}
