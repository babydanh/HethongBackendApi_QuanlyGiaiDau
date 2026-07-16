import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { RankingsRepository } from './rankings.repository';
import { EloEngineService } from './elo-engine.service';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';
import { eq, and, isNull, desc, sql, or, asc, gte, lt } from 'drizzle-orm';
import type { AppTx, AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { RedisService } from '../../providers/redis/redis.service';
import { PG_CONNECTION } from '../../database/database.module';

type Transaction = AppTx;

// ELO Shield: ngưỡng kích hoạt bảo vệ khi user vượt qua mốc ELO nhất định
const ELO_SHIELD_BOUNDARIES = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800] as const;

@Injectable()
export class RankingsService {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly rankingsRepository: RankingsRepository,
    private readonly eloEngineService: EloEngineService,
    private readonly redisService: RedisService,
  ) {}

  private async invalidateLeaderboardCache(categoryId: string) {
    try {
      const client = this.redisService.getClient();
      const keys = await client.keys(`leaderboard:cat:${categoryId}:*`);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (err) {
      console.error('Failed to invalidate ELO cache:', err);
    }
  }

  async getLeaderboard(query: QueryRankingDto) {
    const cacheKey = `leaderboard:cat:${query.categoryId}:type:${query.matchType || 'ALL'}:scope:${query.scope || 'PUBLIC'}:prov:${query.provinceCode || 'ALL'}:gender:${query.genderRestriction || 'ALL'}:page:${query.page || 1}:limit:${query.limit || 20}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      console.error('Failed to get leaderboard cache:', err);
    }

    const data = await this.rankingsRepository.getLeaderboard(query);

    try {
      await this.redisService.set(cacheKey, JSON.stringify(data), 300); // 5 mins TTL
    } catch (err) {
      console.error('Failed to set leaderboard cache:', err);
    }

    return data;
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
    
    const result = await db.transaction(async (tx) => {
      // 1. Lock records
      const winnerRank = await this.rankingsRepository.getOrCreateUserRank(
        tx,
        dto.winnerId,
        dto.categoryId,
        dto.matchType,
        scope,
        dto.communityId,
        true,
        dto.genderRestriction,
      );
      const loserRank = await this.rankingsRepository.getOrCreateUserRank(
        tx,
        dto.loserId,
        dto.categoryId,
        dto.matchType,
        scope,
        dto.communityId,
        true,
        dto.genderRestriction,
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
      let isWinnerShieldActive = false;
      if (scope === 'PUBLIC') {
        const publicWinnerRank = winnerRank as typeof schema.userRanks.$inferSelect;
        isWinnerShieldActive = !!publicWinnerRank.shieldActive;
        for (const boundary of ELO_SHIELD_BOUNDARIES) {
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
        for (const boundary of ELO_SHIELD_BOUNDARIES) {
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
        await this.recalculateUserRankTier(tx, dto.winnerId, dto.categoryId, dto.matchType, dto.genderRestriction);
        await this.recalculateUserRankTier(tx, dto.loserId, dto.categoryId, dto.matchType, dto.genderRestriction);
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

    await this.invalidateLeaderboardCache(dto.categoryId);
    return result;
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
    genderRestriction?: string,
  ) {
    const db = this.rankingsRepository.getDbInstance();

    // 1. Fetch rosters
    const winnerRosters = await db
      .select({
        userId: schema.tournamentRosters.userId,
        userIsMock: schema.users.isMock,
        participantIsMock: schema.tournamentParticipants.isMock,
      })
      .from(schema.tournamentRosters)
      .innerJoin(schema.users, eq(schema.tournamentRosters.userId, schema.users.id))
      .innerJoin(
        schema.tournamentParticipants,
        eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id),
      )
      .where(eq(schema.tournamentRosters.participantId, winnerParticipantId));

    const loserRosters = await db
      .select({
        userId: schema.tournamentRosters.userId,
        userIsMock: schema.users.isMock,
        participantIsMock: schema.tournamentParticipants.isMock,
      })
      .from(schema.tournamentRosters)
      .innerJoin(schema.users, eq(schema.tournamentRosters.userId, schema.users.id))
      .innerJoin(
        schema.tournamentParticipants,
        eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id),
      )
      .where(eq(schema.tournamentRosters.participantId, loserParticipantId));

    if (winnerRosters.length === 0 || loserRosters.length === 0) {
      throw new BadRequestException('Winner or Loser team has no players registered.');
    }

    const hasMockPlayer = [...winnerRosters, ...loserRosters].some(
      (roster) => roster.userIsMock || roster.participantIsMock,
    );
    if (hasMockPlayer) {
      return {
        success: true,
        skipped: true,
        reason: 'MOCK_PARTICIPANT',
      };
    }

    const winnerUserIds = winnerRosters.map((r) => r.userId);
    const loserUserIds = loserRosters.map((r) => r.userId);

    const result = await db.transaction(async (tx) => {
      if (['DOUBLES', 'MIXED_DOUBLES'].includes(matchType) && winnerUserIds.length === 2 && loserUserIds.length === 2) {
        // 1. Sort IDs to make unique pair key
        const wId1 = winnerUserIds[0] < winnerUserIds[1] ? winnerUserIds[0] : winnerUserIds[1];
        const wId2 = winnerUserIds[0] < winnerUserIds[1] ? winnerUserIds[1] : winnerUserIds[0];
        const lId1 = loserUserIds[0] < loserUserIds[1] ? loserUserIds[0] : loserUserIds[1];
        const lId2 = loserUserIds[0] < loserUserIds[1] ? loserUserIds[1] : loserUserIds[0];

        // 2. Lock individual ranks to prevent concurrent updates
        type UserRank = typeof schema.userRanks.$inferSelect | typeof schema.communityRankings.$inferSelect;
        const winnerRanksList: UserRank[] = [];
        for (const uid of winnerUserIds) {
          const r = await this.rankingsRepository.getOrCreateUserRank(tx, uid, categoryId, matchType, scope, communityId, true, genderRestriction);
          winnerRanksList.push(r);
        }
        const loserRanksList: UserRank[] = [];
        for (const uid of loserUserIds) {
          const r = await this.rankingsRepository.getOrCreateUserRank(tx, uid, categoryId, matchType, scope, communityId, true, genderRestriction);
          loserRanksList.push(r);
        }

        // 3. Get or Create Pair ELO records
        let [winnerPair] = await tx
          .select()
          .from(schema.pairRanks)
          .where(
            and(
              eq(schema.pairRanks.user1Id, wId1),
              eq(schema.pairRanks.user2Id, wId2),
              eq(schema.pairRanks.categoryId, categoryId),
              eq(schema.pairRanks.matchType, matchType),
              eq(schema.pairRanks.scope, scope),
              genderRestriction
                ? eq(schema.pairRanks.genderRestriction, genderRestriction)
                : isNull(schema.pairRanks.genderRestriction),
              communityId
                ? eq(schema.pairRanks.communityId, communityId)
                : isNull(schema.pairRanks.communityId),
            )
          )
          .limit(1);

        if (!winnerPair) {
          const avgElo = (winnerRanksList[0].eloPoints + winnerRanksList[1].eloPoints) / 2;
          [winnerPair] = await tx
            .insert(schema.pairRanks)
            .values({
              user1Id: wId1,
              user2Id: wId2,
              categoryId,
              matchType,
              genderRestriction: genderRestriction || null,
              scope,
              communityId: communityId || null,
              eloPoints: Math.round(avgElo),
              matchesPlayed: 0,
              matchesWon: 0,
              winStreak: 0,
            })
            .returning();
        }

        let [loserPair] = await tx
          .select()
          .from(schema.pairRanks)
          .where(
            and(
              eq(schema.pairRanks.user1Id, lId1),
              eq(schema.pairRanks.user2Id, lId2),
              eq(schema.pairRanks.categoryId, categoryId),
              eq(schema.pairRanks.matchType, matchType),
              eq(schema.pairRanks.scope, scope),
              genderRestriction
                ? eq(schema.pairRanks.genderRestriction, genderRestriction)
                : isNull(schema.pairRanks.genderRestriction),
              communityId
                ? eq(schema.pairRanks.communityId, communityId)
                : isNull(schema.pairRanks.communityId),
            )
          )
          .limit(1);

        if (!loserPair) {
          const avgElo = (loserRanksList[0].eloPoints + loserRanksList[1].eloPoints) / 2;
          [loserPair] = await tx
            .insert(schema.pairRanks)
            .values({
              user1Id: lId1,
              user2Id: lId2,
              categoryId,
              matchType,
              genderRestriction: genderRestriction || null,
              scope,
              communityId: communityId || null,
              eloPoints: Math.round(avgElo),
              matchesPlayed: 0,
              matchesWon: 0,
              winStreak: 0,
            })
            .returning();
        }

        // 4. Calculate ELO changes for the pairs
        const winnerPairResult = this.eloEngineService.calculateElo(
          winnerPair.eloPoints,
          loserPair.eloPoints,
          true,
          winnerPair.matchesPlayed,
          winnerPair.winStreak,
        );

        const loserPairResult = this.eloEngineService.calculateElo(
          loserPair.eloPoints,
          winnerPair.eloPoints,
          false,
          loserPair.matchesPlayed,
          loserPair.winStreak,
        );

        // 5. Update pair ranks
        await tx
          .update(schema.pairRanks)
          .set({
            eloPoints: winnerPairResult.newElo,
            matchesPlayed: winnerPair.matchesPlayed + 1,
            matchesWon: winnerPair.matchesWon + 1,
            winStreak: winnerPairResult.newWinStreak,
            updatedAt: new Date(),
          })
          .where(eq(schema.pairRanks.id, winnerPair.id));

        await tx
          .update(schema.pairRanks)
          .set({
            eloPoints: loserPairResult.newElo,
            matchesPlayed: loserPair.matchesPlayed + 1,
            winStreak: 0,
            updatedAt: new Date(),
          })
          .where(eq(schema.pairRanks.id, loserPair.id));

        const winnerDelta = winnerPairResult.changedPoints;
        const loserDelta = loserPairResult.changedPoints;

        // 6. Calculate scaled deltas for individual winners
        // Công thức: stronger player → scale < 1 (ít điểm hơn khi thắng)
        //            weaker player → scale > 1 (nhiều điểm hơn khi thắng - upset bonus)
        // VD: chênh 500 ELO → scale1=0.375, scale2=1.625
        const wElo1 = winnerRanksList[0].eloPoints;
        const wElo2 = winnerRanksList[1].eloPoints;
        const wDiff = Math.abs(wElo1 - wElo2);
        const wScale1 = Math.max(0.2, Math.min(1.8, 1 - wDiff / 800));
        const wScale2 = Math.max(0.2, Math.min(1.8, 1 + wDiff / 800));

        const w1Delta = Math.round(winnerDelta * (wElo1 >= wElo2 ? wScale1 : wScale2));
        const w2Delta = Math.round(winnerDelta * (wElo2 >= wElo1 ? wScale1 : wScale2));

        // 7. Calculate scaled deltas for individual losers
        // Thua với tư cách strong → mất nhiều điểm hơn (scale > 1)
        // Thua với tư cách weak → mất ít điểm hơn (scale < 1, kỳ vọng đã thua)
        const lElo1 = loserRanksList[0].eloPoints;
        const lElo2 = loserRanksList[1].eloPoints;
        const lDiff = Math.abs(lElo1 - lElo2);
        const lScale1 = Math.max(0.2, Math.min(1.8, 1 - lDiff / 800));
        const lScale2 = Math.max(0.2, Math.min(1.8, 1 + lDiff / 800));

        const l1Delta = Math.round(loserDelta * (lElo1 >= lElo2 ? lScale2 : lScale1));
        const l2Delta = Math.round(loserDelta * (lElo2 >= lElo1 ? lScale2 : lScale1));

        const logs: (typeof schema.eloHistoryLogs.$inferInsert)[] = [];

        // 8. Update Winner 1 & 2 user ranks
        const winnersToUpdate = [
          { rank: winnerRanksList[0], delta: w1Delta },
          { rank: winnerRanksList[1], delta: w2Delta },
        ];

        for (const { rank, delta } of winnersToUpdate) {
          const newElo = Math.max(100, rank.eloPoints + delta);
          let isWinnerShieldActive = false;
          if (scope === 'PUBLIC') {
            isWinnerShieldActive = !!(rank as typeof schema.userRanks.$inferSelect).shieldActive;
            for (const boundary of ELO_SHIELD_BOUNDARIES) {
              if (rank.eloPoints < boundary && newElo >= boundary) {
                isWinnerShieldActive = true;
              }
            }
          }

          await this.rankingsRepository.updateUserRank(
            tx,
            rank.id,
            {
              eloPoints: newElo,
              matchesPlayed: rank.matchesPlayed + 1,
              matchesWon: rank.matchesWon + 1,
              winStreak: rank.winStreak + 1,
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
            newElo,
            changedPoints: newElo - rank.eloPoints,
          });
        }

        // 9. Update Loser 1 & 2 user ranks
        const losersToUpdate = [
          { rank: loserRanksList[0], delta: l1Delta },
          { rank: loserRanksList[1], delta: l2Delta },
        ];

        for (const { rank, delta } of losersToUpdate) {
          const newElo = Math.max(100, rank.eloPoints + delta);
          const boundaries = ELO_SHIELD_BOUNDARIES;
          let finalLoserElo = newElo;
          let isLoserShieldActive = false;
          if (scope === 'PUBLIC') {
            const publicRank = rank as typeof schema.userRanks.$inferSelect;
            isLoserShieldActive = !!publicRank.shieldActive;
            for (const boundary of boundaries) {
              if (rank.eloPoints >= boundary && newElo < boundary) {
                if (publicRank.shieldActive) {
                  finalLoserElo = boundary;
                  isLoserShieldActive = false;
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

        // 10. Record history and tiers
        await this.rankingsRepository.insertEloHistory(tx, logs);

        if (scope === 'PUBLIC') {
          for (const uid of winnerUserIds) {
            await this.recalculateUserRankTier(tx, uid, categoryId, matchType, genderRestriction);
          }
          for (const uid of loserUserIds) {
            await this.recalculateUserRankTier(tx, uid, categoryId, matchType, genderRestriction);
          }
        }

        return {
          success: true,
          winnerPlayerCount: winnerRanksList.length,
          loserPlayerCount: loserRanksList.length,
          doublesMode: true,
        };
      }

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
          genderRestriction,
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
          genderRestriction,
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

        let isWinnerShieldActive = false;
        if (scope === 'PUBLIC') {
          isWinnerShieldActive = !!(rank as typeof schema.userRanks.$inferSelect).shieldActive;
          for (const boundary of ELO_SHIELD_BOUNDARIES) {
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

        let finalLoserElo = result.newElo;
        let isLoserShieldActive = false;
        if (scope === 'PUBLIC') {
          const publicRank = rank as typeof schema.userRanks.$inferSelect;
          isLoserShieldActive = !!publicRank.shieldActive;
          for (const boundary of ELO_SHIELD_BOUNDARIES) {
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
          await this.recalculateUserRankTier(tx, userId, categoryId, matchType, genderRestriction);
        }
        for (const userId of loserUserIds) {
          await this.recalculateUserRankTier(tx, userId, categoryId, matchType, genderRestriction);
        }
      }

      return {
        success: true,
        winnerPlayerCount: winnerRanks.length,
        loserPlayerCount: loserRanks.length,
      };
    });

    await this.invalidateLeaderboardCache(categoryId);
    return result;
  }

  async recalculateUserRankTier(
    tx: Transaction,
    userId: string,
    categoryId: string,
    matchType: string,
    genderRestriction?: string,
  ) {
    const genderCondition = genderRestriction
      ? eq(schema.userRanks.genderRestriction, genderRestriction)
      : isNull(schema.userRanks.genderRestriction);
    const tiers = await tx
      .select()
      .from(schema.eloTiers)
      .where(eq(schema.eloTiers.categoryId, categoryId));

    const tierDLow = tiers.find((t) => t.name === 'Low Tier D');
    const tierDHigh = tiers.find((t) => t.name === 'High Tier D');
    const tierCLow = tiers.find((t) => t.name === 'Low Tier C');
    const tierCHigh = tiers.find((t) => t.name === 'High Tier C');
    const tierBLow = tiers.find((t) => t.name === 'Low Tier B');
    const tierBHigh = tiers.find((t) => t.name === 'High Tier B');
    const tierALow = tiers.find((t) => t.name === 'Low Tier A');
    const tierAHigh = tiers.find((t) => t.name === 'High Tier A');
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
          genderCondition,
          isNull(schema.userRanks.communityId),
        ),
      )
      .orderBy(desc(schema.userRanks.eloPoints), schema.userRanks.updatedAt)
      .limit(1);

    // 2. Identify Tier S user (min 1800 ELO under the new system)
    const tierSUserId = (topRank && topRank.eloPoints >= 1800) ? topRank.userId : null;

    // 3. Update all Tier S assignments
    if (tierS) {
      if (tierSUserId) {
        // Assign Tier S to top player
        await tx
          .update(schema.userRanks)
          .set({ tierId: tierS.id })
          .where(eq(schema.userRanks.id, topRank.id));

        // Downgrade any other player currently holding Tier S to Tier A (High)
        await tx
          .update(schema.userRanks)
          .set({ tierId: tierAHigh ? tierAHigh.id : null })
          .where(
            and(
              eq(schema.userRanks.categoryId, categoryId),
              eq(schema.userRanks.matchType, matchType),
              genderCondition,
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
              genderCondition,
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
            genderCondition,
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
          rank.genderRestriction || undefined,
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
          gte(schema.matches.completedAt, fromTime)
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
            lt(schema.eloHistoryLogs.createdAt, completedAt)
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
            lt(schema.matches.completedAt, completedAt)
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
            lt(schema.matches.completedAt, completedAt)
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
            lt(schema.matches.completedAt, completedAt)
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
    await this.invalidateLeaderboardCache(categoryId);
  }

  /**
   * Safe version of recalculateEloChain — tự tạo transaction riêng, không blocking.
   * Dùng khi cần recalculate mà không có sẵn transaction từ caller.
   * Skill: BE Skill 6 (Domain Logic) — chống O(N²) blocking
   */
  async recalculateEloChainSafe(
    playerIds: string[],
    fromTime: Date,
    categoryId: string,
    matchType: string,
  ) {
    await this.db.transaction(async (tx) => {
      await this.recalculateEloChain(tx, playerIds, fromTime, categoryId, matchType);
    });
  }
}
