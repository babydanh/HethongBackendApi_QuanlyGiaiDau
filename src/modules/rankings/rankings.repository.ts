import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq, desc, and, isNull, SQL } from 'drizzle-orm';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';

@Injectable()
export class RankingsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getLeaderboard(query: QueryRankingDto) {
    const { page = 1, limit = 50, categoryId, matchType, communityId } = query;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [eq(schema.userRanks.categoryId, categoryId)];
    if (matchType) {
      conditions.push(eq(schema.userRanks.matchType, matchType));
    }
    if (communityId) {
      conditions.push(eq(schema.userRanks.communityId, communityId));
    } else {
      conditions.push(isNull(schema.userRanks.communityId));
    }

    const whereClause = and(...conditions);

    const data = await this.db
      .select({
        id: schema.userRanks.id,
        userId: schema.userRanks.userId,
        categoryId: schema.userRanks.categoryId,
        communityId: schema.userRanks.communityId,
        matchType: schema.userRanks.matchType,
        eloPoints: schema.userRanks.eloPoints,
        matchesPlayed: schema.userRanks.matchesPlayed,
        matchesWon: schema.userRanks.matchesWon,
        updatedAt: schema.userRanks.updatedAt,
      })
      .from(schema.userRanks)
      .where(whereClause)
      .orderBy(desc(schema.userRanks.eloPoints))
      .limit(limit)
      .offset(offset);

    return {
      data,
      meta: {
        page,
        limit,
      },
    };
  }

  // Helper function to get or create user rank
  private async getOrCreateUserRank(
    tx: Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0],
    userId: string,
    categoryId: string,
    matchType: string,
    communityId?: string,
  ) {
    const conditions: SQL[] = [
      eq(schema.userRanks.userId, userId),
      eq(schema.userRanks.categoryId, categoryId),
      eq(schema.userRanks.matchType, matchType),
    ];
    if (communityId) {
      conditions.push(eq(schema.userRanks.communityId, communityId));
    } else {
      conditions.push(isNull(schema.userRanks.communityId));
    }

    const existing = await tx
      .select()
      .from(schema.userRanks)
      .where(and(...conditions))
      .limit(1);

    if (existing.length > 0) return existing[0];

    const [newRank] = await tx
      .insert(schema.userRanks)
      .values({
        userId,
        categoryId,
        matchType,
        ...(communityId && { communityId }),
        eloPoints: 1200,
        matchesPlayed: 0,
        matchesWon: 0,
      })
      .returning();

    return newRank;
  }

  async processMatchEloUpdate(dto: UpdateEloDto) {
    const { winnerId, loserId, categoryId, matchId, score, matchType, communityId } = dto;

    // Pessimistic transaction for ELO calculation
    return await this.db.transaction(async (tx) => {
      // 1. Get or create Ranks
      const winnerRank = await this.getOrCreateUserRank(
        tx,
        winnerId,
        categoryId,
        matchType,
        communityId,
      );
      const loserRank = await this.getOrCreateUserRank(tx, loserId, categoryId, matchType, communityId);

      // 2. Calculate ELO
      const K = 32;
      const expectedScoreWinner =
        1 /
        (1 + Math.pow(10, (loserRank.eloPoints - winnerRank.eloPoints) / 400));
      const expectedScoreLoser =
        1 /
        (1 + Math.pow(10, (winnerRank.eloPoints - loserRank.eloPoints) / 400));

      const newWinnerElo = Math.round(
        winnerRank.eloPoints + K * (score - expectedScoreWinner),
      );
      const newLoserElo = Math.round(
        loserRank.eloPoints + K * (1 - score - expectedScoreLoser),
      );

      const winnerChange = newWinnerElo - winnerRank.eloPoints;
      const loserChange = newLoserElo - loserRank.eloPoints;

      // 3. Update DB
      await tx
        .update(schema.userRanks)
        .set({
          eloPoints: newWinnerElo,
          matchesPlayed: winnerRank.matchesPlayed + 1,
          matchesWon: winnerRank.matchesWon + (score === 1 ? 1 : 0),
          updatedAt: new Date(),
        })
        .where(eq(schema.userRanks.id, winnerRank.id));

      await tx
        .update(schema.userRanks)
        .set({
          eloPoints: newLoserElo,
          matchesPlayed: loserRank.matchesPlayed + 1,
          updatedAt: new Date(),
        })
        .where(eq(schema.userRanks.id, loserRank.id));

      // 4. Record history
      await tx.insert(schema.eloHistoryLogs).values([
        {
          userId: winnerId,
          categoryId: categoryId,
          matchId: matchId,
          reason: 'MATCH_RESULT',
          previousElo: winnerRank.eloPoints,
          newElo: newWinnerElo,
          changedPoints: winnerChange,
        },
        {
          userId: loserId,
          categoryId: categoryId,
          matchId: matchId,
          reason: 'MATCH_RESULT',
          previousElo: loserRank.eloPoints,
          newElo: newLoserElo,
          changedPoints: loserChange,
        },
      ]);

      return {
        winnerElo: newWinnerElo,
        loserElo: newLoserElo,
      };
    });
  }
}
