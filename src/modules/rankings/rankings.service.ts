import { Injectable, BadRequestException } from '@nestjs/common';
import { RankingsRepository } from './rankings.repository';
import { EloEngineService } from './elo-engine.service';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';

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

      return {
        success: true,
        winnerPlayerCount: winnerRanks.length,
        loserPlayerCount: loserRanks.length,
      };
    });
  }
}
