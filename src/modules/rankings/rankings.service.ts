import {
  Injectable,
  BadRequestException,
  Inject,
  Optional,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RankingsRepository } from './rankings.repository';
import { EloEngineService } from './elo-engine.service';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';
import {
  eq,
  and,
  isNull,
  desc,
  sql,
  or,
  asc,
  gte,
  lt,
  inArray,
} from 'drizzle-orm';
import type { AppTx, AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { RedisService } from '../../providers/redis/redis.service';
import { PG_CONNECTION } from '../../database/database.module';
import { FootballTeamEloService } from './football-team-elo.service';

type Transaction = AppTx;

// ELO Shield: ngưỡng kích hoạt bảo vệ khi user vượt qua mốc ELO nhất định
const ELO_SHIELD_BOUNDARIES = [
  1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800,
] as const;
const ELO_DECAY_INACTIVE_MONTHS = 1;
const ELO_DECAY_THRESHOLD = 1400;
const ELO_DECAY_RATES = [
  { minElo: 1700, rate: 0.05 },
  { minElo: 1600, rate: 0.04 },
  { minElo: 1500, rate: 0.03 },
  { minElo: 1400, rate: 0.02 },
] as const;
const ELO_DECAY_FLOOR = 1000;

@Injectable()
export class RankingsService {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly rankingsRepository: RankingsRepository,
    private readonly eloEngineService: EloEngineService,
    private readonly redisService: RedisService,
    @Optional()
    private readonly footballTeamEloService?: FootballTeamEloService,
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

  async invalidateLeaderboardCacheForCategory(categoryId: string) {
    await this.invalidateLeaderboardCache(categoryId);
  }

  /**
   * Trích xuất scoreRatio (winnerPoints / totalPoints) từ scoreDetails của match.
   * @returns scoreRatio từ 0.5 đến 0.85, hoặc undefined nếu không có dữ liệu set.
   */
  private extractScoreRatio(
    scoreDetails: Record<string, unknown> | null | undefined,
    winnerParticipantId: string,
    participant1Id: string | null,
  ): number | undefined {
    if (
      !scoreDetails?.sets ||
      !Array.isArray(scoreDetails.sets) ||
      scoreDetails.sets.length === 0
    ) {
      return undefined;
    }

    let team1Total = 0;
    let team2Total = 0;

    for (const set of scoreDetails.sets as Array<Record<string, unknown>>) {
      team1Total += Number(set.team1Score) || 0;
      team2Total += Number(set.team2Score) || 0;
    }

    const total = team1Total + team2Total;
    if (total === 0) return undefined;

    // Xác định bên nào là winner dựa trên participant IDs
    const isWinnerTeam1 = participant1Id === winnerParticipantId;
    const winnerPoints = isWinnerTeam1 ? team1Total : team2Total;
    const loserPoints = isWinnerTeam1 ? team2Total : team1Total;

    // Clamp: 0.5 (sát nút) → 0.85 (hủy diệt tối đa)
    return Math.min(
      0.85,
      Math.max(0.5, winnerPoints / (winnerPoints + loserPoints)),
    );
  }

  async insertAdminEloHistory(
    tx: Transaction,
    log: typeof schema.eloHistoryLogs.$inferInsert,
  ) {
    return this.rankingsRepository.insertEloHistory(tx, [log]);
  }

  async getLeaderboard(query: QueryRankingDto) {
    const cacheKey = `leaderboard:cat:${query.categoryId}:type:${query.matchType || 'ALL'}:scope:${query.scope || 'PUBLIC'}:prov:${query.provinceCode || 'ALL'}:gender:${query.genderRestriction || 'ALL'}:comm:${query.communityId || 'ALL'}:cursor:${query.cursor || 'FIRST'}:limit:${query.limit || 20}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      console.error('Failed to get leaderboard cache:', err);
    }

    let data;
    try {
      data = await this.rankingsRepository.getLeaderboard(query);
    } catch (error) {
      if (query.scope === 'COMMUNITY' && query.communityId) {
        // Keep the club page usable while a stale/missing ranking projection is
        // being repaired. The clients will hydrate joined members at base ELO.
        console.error('Community leaderboard unavailable:', error);
        data = {
          data: [],
          meta: { page: query.page || 1, limit: query.limit || 20 },
        };
      } else {
        throw error;
      }
    }

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
      matchType?: string;
      genderRestriction?: string;
      partnerId?: string;
      page?: number;
      limit?: number;
      cursor?: string;
    },
  ) {
    return this.rankingsRepository.getEloHistory(userId, query);
  }

  // Recalculate ELO for a single match manually (via Admin Endpoint)
  async updateMatchElo(dto: UpdateEloDto) {
    const db = this.rankingsRepository.getDbInstance();
    const [matchContext] = await db
      .select({
        status: schema.matches.status,
        isRanked: schema.tournaments.isRanked,
        tournamentType: schema.tournaments.tournamentType,
        communityId: schema.tournaments.communityId,
        categoryId: schema.tournaments.categoryId,
        matchType: schema.tournaments.matchType,
        genderRestriction: schema.tournaments.genderRestriction,
        divisionMatchType: schema.tournamentDivisions.matchType,
        divisionGenderRestriction: schema.tournamentDivisions.genderRestriction,
      })
      .from(schema.matches)
      .innerJoin(
        schema.tournaments,
        eq(schema.matches.tournamentId, schema.tournaments.id),
      )
      .innerJoin(
        schema.tournamentStages,
        eq(schema.matches.stageId, schema.tournamentStages.id),
      )
      .leftJoin(
        schema.tournamentDivisions,
        eq(
          schema.tournamentStages.tournamentDivisionId,
          schema.tournamentDivisions.id,
        ),
      )
      .where(eq(schema.matches.id, dto.matchId))
      .limit(1);

    if (!matchContext) {
      throw new BadRequestException('Trận đấu không tồn tại.');
    }
    if (matchContext.status !== 'COMPLETED') {
      throw new BadRequestException('Chỉ trận đã hoàn tất mới được tính ELO.');
    }
    if (!matchContext.isRanked) {
      throw new BadRequestException('Trận đấu thuộc giải không xếp hạng ELO.');
    }

    const effectiveMatchType =
      matchContext.divisionMatchType ?? matchContext.matchType;
    const effectiveGenderRestriction =
      matchContext.divisionGenderRestriction ?? matchContext.genderRestriction;
    if (
      effectiveMatchType === 'DOUBLES' ||
      effectiveMatchType === 'MIXED_DOUBLES'
    ) {
      throw new BadRequestException(
        'Trận đôi phải được tính ELO qua luồng hoàn tất trận, không dùng endpoint ELO thủ công cho user đơn.',
      );
    }
    const effectiveCommunityId =
      matchContext.tournamentType === 'CLUB' ? matchContext.communityId : null;
    if (matchContext.tournamentType === 'CLUB' && !effectiveCommunityId) {
      throw new BadRequestException(
        'Giải CLB phải có câu lạc bộ để ghi ELO nội bộ.',
      );
    }
    if (
      dto.categoryId !== matchContext.categoryId ||
      dto.matchType !== effectiveMatchType ||
      (dto.communityId ?? null) !== effectiveCommunityId ||
      (dto.genderRestriction ?? null) !== (effectiveGenderRestriction ?? null)
    ) {
      throw new BadRequestException(
        'Thông tin tính ELO không khớp cấu hình của trận đấu.',
      );
    }

    const scope = effectiveCommunityId ? 'COMMUNITY' : 'PUBLIC';

    // Fetch scoreDetails để tính Score Factor Modifier
    let scoreRatio: number | undefined;
    try {
      const [matchData] = await db
        .select({
          participant1Id: schema.matches.participant1Id,
          scoreDetails: schema.matches.scoreDetails,
        })
        .from(schema.matches)
        .where(eq(schema.matches.id, dto.matchId))
        .limit(1);

      if (matchData) {
        scoreRatio = this.extractScoreRatio(
          matchData.scoreDetails as Record<string, unknown> | null | undefined,
          dto.winnerId, // winnerParticipantId = winnerId (người thắng trong DTO)
          matchData.participant1Id,
        );
      }
    } catch (err) {
      console.warn(
        'Failed to fetch scoreDetails for admin ELO update, scoreFactor disabled:',
        err.message,
      );
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${dto.matchId}))`,
      );
      const previousLogs = await tx
        .select({ userId: schema.eloHistoryLogs.userId })
        .from(schema.eloHistoryLogs)
        .where(
          and(
            eq(schema.eloHistoryLogs.matchId, dto.matchId),
            inArray(schema.eloHistoryLogs.userId, [dto.winnerId, dto.loserId]),
          ),
        );

      if (previousLogs.length > 0) {
        if (previousLogs.length === 2) {
          return { alreadyProcessed: true, matchId: dto.matchId };
        }
        throw new BadRequestException(
          'Lịch sử ELO của trận đấu không đầy đủ; không thể tính lại tự động.',
        );
      }

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
        scoreRatio,
      );

      const loserResult = this.eloEngineService.calculateElo(
        loserRank.eloPoints,
        winnerRank.eloPoints,
        false,
        loserRank.matchesPlayed,
        loserRank.winStreak,
        scoreRatio,
      );

      // 3. Update ranks with shield logic
      let isWinnerShieldActive = false;
      if (scope === 'PUBLIC') {
        const publicWinnerRank =
          winnerRank as typeof schema.userRanks.$inferSelect;
        isWinnerShieldActive = !!publicWinnerRank.shieldActive;
        for (const boundary of ELO_SHIELD_BOUNDARIES) {
          if (
            winnerRank.eloPoints < boundary &&
            winnerResult.newElo >= boundary
          ) {
            isWinnerShieldActive = true;
          }
        }
      }

      let finalLoserElo = loserResult.newElo;
      let isLoserShieldActive = false;
      if (scope === 'PUBLIC') {
        const publicLoserRank =
          loserRank as typeof schema.userRanks.$inferSelect;
        isLoserShieldActive = !!publicLoserRank.shieldActive;
        for (const boundary of ELO_SHIELD_BOUNDARIES) {
          if (
            loserRank.eloPoints >= boundary &&
            loserResult.newElo < boundary
          ) {
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
          peakElo: winnerResult.newPeakElo,
          lastActiveAt: new Date(),
          lastDecayAt: new Date(),
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
          peakElo: loserResult.newPeakElo,
          lastActiveAt: new Date(),
          lastDecayAt: new Date(),
        },
        scope,
      );

      if (scope === 'PUBLIC') {
        await this.recalculateUserRankTier(
          tx,
          dto.winnerId,
          dto.categoryId,
          dto.matchType,
          dto.genderRestriction,
        );
        await this.recalculateUserRankTier(
          tx,
          dto.loserId,
          dto.categoryId,
          dto.matchType,
          dto.genderRestriction,
        );
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
      .innerJoin(
        schema.users,
        eq(schema.tournamentRosters.userId, schema.users.id),
      )
      .innerJoin(
        schema.tournamentParticipants,
        eq(
          schema.tournamentRosters.participantId,
          schema.tournamentParticipants.id,
        ),
      )
      .where(eq(schema.tournamentRosters.participantId, winnerParticipantId));

    const loserRosters = await db
      .select({
        userId: schema.tournamentRosters.userId,
        userIsMock: schema.users.isMock,
        participantIsMock: schema.tournamentParticipants.isMock,
      })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.users,
        eq(schema.tournamentRosters.userId, schema.users.id),
      )
      .innerJoin(
        schema.tournamentParticipants,
        eq(
          schema.tournamentRosters.participantId,
          schema.tournamentParticipants.id,
        ),
      )
      .where(eq(schema.tournamentRosters.participantId, loserParticipantId));

    if (winnerRosters.length === 0 || loserRosters.length === 0) {
      throw new BadRequestException(
        'Winner or Loser team has no players registered.',
      );
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
    const isDoublesMatch = ['DOUBLES', 'MIXED_DOUBLES'].includes(matchType);
    const expectedRosterSize = isDoublesMatch ? 2 : 1;
    if (
      winnerUserIds.length !== expectedRosterSize ||
      loserUserIds.length !== expectedRosterSize
    ) {
      throw new BadRequestException(
        `${isDoublesMatch ? 'Trận đôi' : 'Trận đơn'} phải có đúng ${expectedRosterSize} vận động viên mỗi bên để tính ELO.`,
      );
    }

    // 2a. Fetch match scoreDetails để tính Score Factor Modifier
    let scoreRatio: number | undefined;
    try {
      const [matchData] = await db
        .select({
          participant1Id: schema.matches.participant1Id,
          scoreDetails: schema.matches.scoreDetails,
        })
        .from(schema.matches)
        .where(eq(schema.matches.id, matchId))
        .limit(1);

      if (matchData) {
        scoreRatio = this.extractScoreRatio(
          matchData.scoreDetails as Record<string, unknown> | null | undefined,
          winnerParticipantId,
          matchData.participant1Id,
        );
      }
    } catch (err) {
      console.warn(
        'Failed to fetch scoreDetails for match, scoreFactor disabled:',
        err.message,
      );
    }

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${matchId}))`);
      const previousLogs = await tx
        .select({ userId: schema.eloHistoryLogs.userId })
        .from(schema.eloHistoryLogs)
        .where(
          and(
            eq(schema.eloHistoryLogs.matchId, matchId),
            inArray(schema.eloHistoryLogs.userId, [
              ...winnerUserIds,
              ...loserUserIds,
            ]),
          ),
        );
      if (previousLogs.length > 0) {
        const expectedLogCount = winnerUserIds.length + loserUserIds.length;
        if (previousLogs.length === expectedLogCount) {
          return { alreadyProcessed: true, matchId };
        }
        throw new BadRequestException(
          'Lịch sử ELO của trận đấu không đầy đủ; không thể tính lại tự động.',
        );
      }

      if (isDoublesMatch) {
        // 1. Sort IDs to make unique pair key
        const wId1 =
          winnerUserIds[0] < winnerUserIds[1]
            ? winnerUserIds[0]
            : winnerUserIds[1];
        const wId2 =
          winnerUserIds[0] < winnerUserIds[1]
            ? winnerUserIds[1]
            : winnerUserIds[0];
        const lId1 =
          loserUserIds[0] < loserUserIds[1] ? loserUserIds[0] : loserUserIds[1];
        const lId2 =
          loserUserIds[0] < loserUserIds[1] ? loserUserIds[1] : loserUserIds[0];

        // 2. Lock individual ranks to prevent concurrent updates
        type UserRank =
          | typeof schema.userRanks.$inferSelect
          | typeof schema.communityRankings.$inferSelect;
        const winnerRanksList: UserRank[] = [];
        for (const uid of winnerUserIds) {
          const r = await this.rankingsRepository.getOrCreateUserRank(
            tx,
            uid,
            categoryId,
            matchType,
            scope,
            communityId,
            true,
            genderRestriction,
          );
          winnerRanksList.push(r);
        }
        const loserRanksList: UserRank[] = [];
        for (const uid of loserUserIds) {
          const r = await this.rankingsRepository.getOrCreateUserRank(
            tx,
            uid,
            categoryId,
            matchType,
            scope,
            communityId,
            true,
            genderRestriction,
          );
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
            ),
          )
          .limit(1);

        if (!winnerPair) {
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
              // Pair ELO is an independent rating for this exact pair.
              eloPoints: ELO_DECAY_FLOOR,
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
            ),
          )
          .limit(1);

        if (!loserPair) {
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
              // Pair ELO is an independent rating for this exact pair.
              eloPoints: ELO_DECAY_FLOOR,
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
          scoreRatio,
        );

        const loserPairResult = this.eloEngineService.calculateElo(
          loserPair.eloPoints,
          winnerPair.eloPoints,
          false,
          loserPair.matchesPlayed,
          loserPair.winStreak,
          scoreRatio,
        );

        // 5. Update pair ranks
        const pairActivityAt = new Date();
        await tx
          .update(schema.pairRanks)
          .set({
            eloPoints: Math.max(ELO_DECAY_FLOOR, winnerPairResult.newElo),
            matchesPlayed: winnerPair.matchesPlayed + 1,
            matchesWon: winnerPair.matchesWon + 1,
            winStreak: winnerPairResult.newWinStreak,
            lastActiveAt: pairActivityAt,
            lastDecayAt: pairActivityAt,
            updatedAt: pairActivityAt,
          })
          .where(eq(schema.pairRanks.id, winnerPair.id));

        await tx
          .update(schema.pairRanks)
          .set({
            eloPoints: Math.max(ELO_DECAY_FLOOR, loserPairResult.newElo),
            matchesPlayed: loserPair.matchesPlayed + 1,
            winStreak: 0,
            lastActiveAt: pairActivityAt,
            lastDecayAt: pairActivityAt,
            updatedAt: pairActivityAt,
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

        const w1Delta = Math.round(
          winnerDelta * (wElo1 >= wElo2 ? wScale1 : wScale2),
        );
        const w2Delta = Math.round(
          winnerDelta * (wElo2 >= wElo1 ? wScale1 : wScale2),
        );

        // 7. Calculate scaled deltas for individual losers
        // Thua với tư cách strong → mất nhiều điểm hơn (scale > 1)
        // Thua với tư cách weak → mất ít điểm hơn (scale < 1, kỳ vọng đã thua)
        const lElo1 = loserRanksList[0].eloPoints;
        const lElo2 = loserRanksList[1].eloPoints;
        const lDiff = Math.abs(lElo1 - lElo2);
        const lScale1 = Math.max(0.2, Math.min(1.8, 1 - lDiff / 800));
        const lScale2 = Math.max(0.2, Math.min(1.8, 1 + lDiff / 800));

        const l1Delta = Math.round(
          loserDelta * (lElo1 >= lElo2 ? lScale2 : lScale1),
        );
        const l2Delta = Math.round(
          loserDelta * (lElo2 >= lElo1 ? lScale2 : lScale1),
        );

        const logs: (typeof schema.eloHistoryLogs.$inferInsert)[] = [];

        // 8. Update Winner 1 & 2 user ranks
        const winnersToUpdate = [
          { rank: winnerRanksList[0], delta: w1Delta },
          { rank: winnerRanksList[1], delta: w2Delta },
        ];

        for (const { rank, delta } of winnersToUpdate) {
          const newElo = Math.max(ELO_DECAY_FLOOR, rank.eloPoints + delta);
          let isWinnerShieldActive = false;
          if (scope === 'PUBLIC') {
            isWinnerShieldActive = !!(
              rank as typeof schema.userRanks.$inferSelect
            ).shieldActive;
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
              peakElo: Math.max(rank.peakElo ?? rank.eloPoints, newElo),
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
          const newElo = Math.max(ELO_DECAY_FLOOR, rank.eloPoints + delta);
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
              peakElo: rank.peakElo ?? rank.eloPoints,
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
            await this.recalculateUserRankTier(
              tx,
              uid,
              categoryId,
              matchType,
              genderRestriction,
            );
          }
          for (const uid of loserUserIds) {
            await this.recalculateUserRankTier(
              tx,
              uid,
              categoryId,
              matchType,
              genderRestriction,
            );
          }
        } else if (scope === 'COMMUNITY') {
          for (const uid of winnerUserIds) {
            await this.recalculateCommunityRankTier(
              tx,
              uid,
              categoryId,
              matchType,
              communityId,
              genderRestriction,
            );
          }
          for (const uid of loserUserIds) {
            await this.recalculateCommunityRankTier(
              tx,
              uid,
              categoryId,
              matchType,
              communityId,
              genderRestriction,
            );
          }
        }

        // Update lastActiveAt for all doubles players
        const dNow = new Date();
        if (scope === 'PUBLIC') {
          for (const uid of [...winnerUserIds, ...loserUserIds]) {
            await tx
              .update(schema.userRanks)
              .set({ lastActiveAt: dNow, lastDecayAt: dNow } as any)
              .where(
                and(
                  eq(schema.userRanks.userId, uid),
                  eq(schema.userRanks.categoryId, categoryId),
                  eq(schema.userRanks.matchType, matchType),
                  genderRestriction
                    ? eq(schema.userRanks.genderRestriction, genderRestriction)
                    : isNull(schema.userRanks.genderRestriction),
                  isNull(schema.userRanks.communityId),
                ),
              );
          }
        } else if (scope === 'COMMUNITY') {
          for (const uid of [...winnerUserIds, ...loserUserIds]) {
            await tx
              .update(schema.communityRankings)
              .set({ lastActiveAt: dNow, lastDecayAt: dNow } as any)
              .where(
                and(
                  eq(schema.communityRankings.userId, uid),
                  eq(schema.communityRankings.categoryId, categoryId),
                  eq(schema.communityRankings.matchType, matchType),
                  genderRestriction
                    ? eq(
                        schema.communityRankings.genderRestriction,
                        genderRestriction,
                      )
                    : isNull(schema.communityRankings.genderRestriction),
                  communityId
                    ? eq(schema.communityRankings.communityId, communityId)
                    : undefined,
                ),
              );
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
      type UserRank =
        | typeof schema.userRanks.$inferSelect
        | typeof schema.communityRankings.$inferSelect;
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
      const avgWinnerElo =
        winnerRanks.reduce((sum, r) => sum + r.eloPoints, 0) /
        winnerRanks.length;
      const avgLoserElo =
        loserRanks.reduce((sum, r) => sum + r.eloPoints, 0) / loserRanks.length;

      const logs: (typeof schema.eloHistoryLogs.$inferInsert)[] = [];

      // 4. Update Winners
      for (const rank of winnerRanks) {
        const result = this.eloEngineService.calculateElo(
          rank.eloPoints,
          avgLoserElo,
          true,
          rank.matchesPlayed,
          rank.winStreak,
          scoreRatio,
        );

        let isWinnerShieldActive = false;
        if (scope === 'PUBLIC') {
          isWinnerShieldActive = !!(
            rank as typeof schema.userRanks.$inferSelect
          ).shieldActive;
          for (const boundary of ELO_SHIELD_BOUNDARIES) {
            if (rank.eloPoints < boundary && result.newElo >= boundary) {
              isWinnerShieldActive = true;
            }
          }
        }

        const winnerElo = Math.max(ELO_DECAY_FLOOR, result.newElo);
        await this.rankingsRepository.updateUserRank(
          tx,
          rank.id,
          {
            eloPoints: winnerElo,
            matchesPlayed: rank.matchesPlayed + 1,
            matchesWon: rank.matchesWon + 1,
            winStreak: result.newWinStreak,
            shieldActive: isWinnerShieldActive,
            peakElo: result.newPeakElo,
          },
          scope,
        );

        logs.push({
          userId: rank.userId,
          categoryId,
          matchId,
          reason: 'MATCH_WIN',
          previousElo: rank.eloPoints,
          newElo: winnerElo,
          changedPoints: winnerElo - rank.eloPoints,
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
          scoreRatio,
        );

        const resultElo = Math.max(ELO_DECAY_FLOOR, result.newElo);
        let finalLoserElo = resultElo;
        let isLoserShieldActive = false;
        if (scope === 'PUBLIC') {
          const publicRank = rank as typeof schema.userRanks.$inferSelect;
          isLoserShieldActive = !!publicRank.shieldActive;
          for (const boundary of ELO_SHIELD_BOUNDARIES) {
            if (rank.eloPoints >= boundary && resultElo < boundary) {
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
            peakElo: result.newPeakElo,
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
          await this.recalculateUserRankTier(
            tx,
            userId,
            categoryId,
            matchType,
            genderRestriction,
          );
        }
        for (const userId of loserUserIds) {
          await this.recalculateUserRankTier(
            tx,
            userId,
            categoryId,
            matchType,
            genderRestriction,
          );
        }
      } else if (scope === 'COMMUNITY') {
        for (const userId of winnerUserIds) {
          await this.recalculateCommunityRankTier(
            tx,
            userId,
            categoryId,
            matchType,
            communityId,
            genderRestriction,
          );
        }
        for (const userId of loserUserIds) {
          await this.recalculateCommunityRankTier(
            tx,
            userId,
            categoryId,
            matchType,
            communityId,
            genderRestriction,
          );
        }
      }

      // Update lastActiveAt for both scopes
      const now = new Date();
      for (const userId of [...winnerUserIds, ...loserUserIds]) {
        if (scope === 'COMMUNITY') {
          await tx
            .update(schema.communityRankings)
            .set({ lastActiveAt: now, lastDecayAt: now } as any)
            .where(
              and(
                eq(schema.communityRankings.userId, userId),
                eq(schema.communityRankings.categoryId, categoryId),
                eq(schema.communityRankings.matchType, matchType),
                genderRestriction
                  ? eq(
                      schema.communityRankings.genderRestriction,
                      genderRestriction,
                    )
                  : isNull(schema.communityRankings.genderRestriction),
                communityId
                  ? eq(schema.communityRankings.communityId, communityId)
                  : undefined,
              ),
            );
        } else {
          await tx
            .update(schema.userRanks)
            .set({ lastActiveAt: now, lastDecayAt: now } as any)
            .where(
              and(
                eq(schema.userRanks.userId, userId),
                eq(schema.userRanks.categoryId, categoryId),
                eq(schema.userRanks.matchType, matchType),
                genderRestriction
                  ? eq(schema.userRanks.genderRestriction, genderRestriction)
                  : isNull(schema.userRanks.genderRestriction),
                isNull(schema.userRanks.communityId),
              ),
            );
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
    const tierSUserId =
      topRank && topRank.eloPoints >= 1800 ? topRank.userId : null;

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
              sql`${schema.userRanks.userId} != ${tierSUserId}`,
            ),
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
              eq(schema.userRanks.tierId, tierS.id),
            ),
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

  /**
   * Apply the monthly inactivity penalty once per rank and per calendar month.
   * The advisory lock makes this safe when several API instances run the cron.
   */
  @Cron('0 3 * * *')
  async applyMonthlyInactivityDecay() {
    const now = new Date();
    const inactiveBefore = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - ELO_DECAY_INACTIVE_MONTHS,
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
      ),
    );
    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const affectedCategoryIds = new Set<string>();

    await this.db.transaction(async (tx) => {
      const lockResult = await tx.execute(
        sql`select pg_try_advisory_xact_lock(hashtext('elo-monthly-inactivity-decay')) as locked`,
      );
      const locked = Boolean(
        (lockResult as unknown as { rows?: Array<{ locked?: boolean }> })
          .rows?.[0]?.locked,
      );
      if (!locked) return;

      const publicRanks = await tx
        .select()
        .from(schema.userRanks)
        .where(
          and(
            lt(schema.userRanks.lastActiveAt, inactiveBefore),
            lt(schema.userRanks.lastDecayAt, currentMonthStart),
            isNull(schema.userRanks.communityId),
          ),
        );
      const communityRanks = await tx
        .select()
        .from(schema.communityRankings)
        .where(
          and(
            lt(schema.communityRankings.lastActiveAt, inactiveBefore),
            lt(schema.communityRankings.lastDecayAt, currentMonthStart),
          ),
        );
      const pairRanks = await tx
        .select()
        .from(schema.pairRanks)
        .where(
          and(
            lt(schema.pairRanks.lastActiveAt, inactiveBefore),
            lt(schema.pairRanks.lastDecayAt, currentMonthStart),
          ),
        );

      const monthsSince = (lastDecayAt: Date) =>
        Math.max(
          1,
          (now.getUTCFullYear() - lastDecayAt.getUTCFullYear()) * 12 +
            now.getUTCMonth() -
            lastDecayAt.getUTCMonth(),
        );
      const decayedElo = (elo: number, months: number) => {
        if (elo < ELO_DECAY_THRESHOLD) return elo;

        const rate = ELO_DECAY_RATES.find(
          (bracket) => elo >= bracket.minElo,
        )?.rate;
        if (!rate) return elo;

        return Math.max(
          ELO_DECAY_FLOOR,
          Math.round(elo * Math.pow(1 - rate, months)),
        );
      };

      for (const rank of publicRanks) {
        let newElo = decayedElo(rank.eloPoints, monthsSince(rank.lastDecayAt));
        let shieldActive = rank.shieldActive;
        if (shieldActive) {
          const protectedBoundary = [...ELO_SHIELD_BOUNDARIES]
            .reverse()
            .find(
              (boundary) => rank.eloPoints >= boundary && newElo < boundary,
            );
          if (protectedBoundary !== undefined) {
            newElo = protectedBoundary;
            shieldActive = false;
          }
        }
        await tx
          .update(schema.userRanks)
          .set({
            eloPoints: newElo,
            shieldActive,
            lastDecayAt: now,
            updatedAt: now,
          })
          .where(eq(schema.userRanks.id, rank.id));
        await this.recalculateUserRankTier(
          tx,
          rank.userId,
          rank.categoryId,
          rank.matchType,
          rank.genderRestriction || undefined,
        );
        affectedCategoryIds.add(rank.categoryId);
        if (newElo !== rank.eloPoints) {
          await this.rankingsRepository.insertEloHistory(tx, [
            {
              userId: rank.userId,
              categoryId: rank.categoryId,
              matchId: null,
              reason: 'INACTIVITY_DECAY',
              previousElo: rank.eloPoints,
              newElo,
              changedPoints: newElo - rank.eloPoints,
            },
          ]);
        }
      }

      for (const rank of communityRanks) {
        const newElo = decayedElo(
          rank.eloPoints,
          monthsSince(rank.lastDecayAt),
        );
        await tx
          .update(schema.communityRankings)
          .set({ eloPoints: newElo, lastDecayAt: now, updatedAt: now })
          .where(eq(schema.communityRankings.id, rank.id));
        await this.recalculateCommunityRankTier(
          tx,
          rank.userId,
          rank.categoryId,
          rank.matchType,
          rank.communityId,
          rank.genderRestriction || undefined,
        );
        affectedCategoryIds.add(rank.categoryId);
      }

      for (const rank of pairRanks) {
        const newElo = decayedElo(
          rank.eloPoints,
          monthsSince(rank.lastDecayAt),
        );
        await tx
          .update(schema.pairRanks)
          .set({ eloPoints: newElo, lastDecayAt: now, updatedAt: now })
          .where(eq(schema.pairRanks.id, rank.id));
        affectedCategoryIds.add(rank.categoryId);
      }
    });

    await Promise.all(
      [...affectedCategoryIds].map((categoryId) =>
        this.invalidateLeaderboardCache(categoryId),
      ),
    );
  }

  async recalculateCommunityRankTier(
    tx: Transaction,
    userId: string,
    categoryId: string,
    matchType: string,
    communityId?: string,
    genderRestriction?: string,
  ) {
    const tiers = await tx
      .select()
      .from(schema.eloTiers)
      .where(eq(schema.eloTiers.categoryId, categoryId))
      .orderBy(schema.eloTiers.minElo);
    if (tiers.length === 0) return;

    const genderCondition = genderRestriction
      ? eq(schema.communityRankings.genderRestriction, genderRestriction)
      : isNull(schema.communityRankings.genderRestriction);

    const [rank] = await tx
      .select()
      .from(schema.communityRankings)
      .where(
        and(
          eq(schema.communityRankings.userId, userId),
          eq(schema.communityRankings.categoryId, categoryId),
          eq(schema.communityRankings.matchType, matchType),
          genderCondition,
          eq(schema.communityRankings.communityId, communityId ?? ''),
        ),
      )
      .limit(1);

    if (rank) {
      const elo = rank.eloPoints;
      let targetTier: typeof schema.eloTiers.$inferSelect | null = null;
      for (const t of tiers) {
        if (elo >= t.minElo) targetTier = t;
      }
      // Community tier is derived at read time from the shared elo_tiers
      // ranges. Keep this path for parity with global rank recalculation, but
      // do not persist a duplicate tier foreign key on community rankings.
      void targetTier;
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
      .innerJoin(
        schema.tournamentGroups,
        eq(schema.matches.groupId, schema.tournamentGroups.id),
      )
      .innerJoin(
        schema.tournamentStages,
        eq(schema.tournamentGroups.stageId, schema.tournamentStages.id),
      )
      .innerJoin(
        schema.tournaments,
        eq(schema.tournamentStages.tournamentId, schema.tournaments.id),
      )
      .innerJoin(
        schema.tournamentRosters,
        or(
          eq(
            schema.matches.participant1Id,
            schema.tournamentRosters.participantId,
          ),
          eq(
            schema.matches.participant2Id,
            schema.tournamentRosters.participantId,
          ),
        ),
      )
      .where(
        and(
          eq(schema.tournaments.categoryId, categoryId),
          eq(schema.tournaments.matchType, matchType),
          eq(schema.matches.status, 'COMPLETED'),
          gte(schema.matches.completedAt, fromTime),
        ),
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
    const playerStates = new Map<
      string,
      {
        elo: number;
        matchesPlayed: number;
        matchesWon: number;
        winStreak: number;
        shieldActive: boolean;
        peakElo: number;
      }
    >();

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
            lt(schema.eloHistoryLogs.createdAt, completedAt),
          ),
        )
        .orderBy(desc(schema.eloHistoryLogs.createdAt))
        .limit(1);

      const startingElo = lastLog?.newElo ?? 1000;

      const playedRes = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.matches)
        .innerJoin(
          schema.tournamentGroups,
          eq(schema.matches.groupId, schema.tournamentGroups.id),
        )
        .innerJoin(
          schema.tournamentStages,
          eq(schema.tournamentGroups.stageId, schema.tournamentStages.id),
        )
        .innerJoin(
          schema.tournaments,
          eq(schema.tournamentStages.tournamentId, schema.tournaments.id),
        )
        .innerJoin(
          schema.tournamentRosters,
          or(
            eq(
              schema.matches.participant1Id,
              schema.tournamentRosters.participantId,
            ),
            eq(
              schema.matches.participant2Id,
              schema.tournamentRosters.participantId,
            ),
          ),
        )
        .where(
          and(
            eq(schema.tournamentRosters.userId, userId),
            eq(schema.tournaments.categoryId, categoryId),
            eq(schema.tournaments.matchType, matchType),
            eq(schema.matches.status, 'COMPLETED'),
            lt(schema.matches.completedAt, completedAt),
          ),
        );
      const matchesPlayed = Number(playedRes[0]?.count || 0);

      const wonRes = await tx
        .select({ count: sql<number>`count(*)` })
        .from(schema.matches)
        .innerJoin(
          schema.tournamentGroups,
          eq(schema.matches.groupId, schema.tournamentGroups.id),
        )
        .innerJoin(
          schema.tournamentStages,
          eq(schema.tournamentGroups.stageId, schema.tournamentStages.id),
        )
        .innerJoin(
          schema.tournaments,
          eq(schema.tournamentStages.tournamentId, schema.tournaments.id),
        )
        .innerJoin(
          schema.tournamentRosters,
          eq(schema.matches.winnerId, schema.tournamentRosters.participantId),
        )
        .where(
          and(
            eq(schema.tournamentRosters.userId, userId),
            eq(schema.tournaments.categoryId, categoryId),
            eq(schema.tournaments.matchType, matchType),
            eq(schema.matches.status, 'COMPLETED'),
            lt(schema.matches.completedAt, completedAt),
          ),
        );
      const matchesWon = Number(wonRes[0]?.count || 0);

      const priorMatches = await tx
        .select({
          winnerId: schema.matches.winnerId,
          p1Id: schema.matches.participant1Id,
          p2Id: schema.matches.participant2Id,
          participantId: schema.tournamentRosters.participantId,
        })
        .from(schema.matches)
        .innerJoin(
          schema.tournamentGroups,
          eq(schema.matches.groupId, schema.tournamentGroups.id),
        )
        .innerJoin(
          schema.tournamentStages,
          eq(schema.tournamentGroups.stageId, schema.tournamentStages.id),
        )
        .innerJoin(
          schema.tournaments,
          eq(schema.tournamentStages.tournamentId, schema.tournaments.id),
        )
        .innerJoin(
          schema.tournamentRosters,
          or(
            eq(
              schema.matches.participant1Id,
              schema.tournamentRosters.participantId,
            ),
            eq(
              schema.matches.participant2Id,
              schema.tournamentRosters.participantId,
            ),
          ),
        )
        .where(
          and(
            eq(schema.tournamentRosters.userId, userId),
            eq(schema.tournaments.categoryId, categoryId),
            eq(schema.tournaments.matchType, matchType),
            eq(schema.matches.status, 'COMPLETED'),
            lt(schema.matches.completedAt, completedAt),
          ),
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

      const state = {
        elo: startingElo,
        matchesPlayed,
        matchesWon,
        winStreak,
        shieldActive,
        peakElo: startingElo,
      };
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

      const winnerUserIds: string[] = winnerRosters.map((r) => r.userId);
      const loserUserIds: string[] = loserRosters.map((r) => r.userId);

      const isMatchAffected = [...winnerUserIds, ...loserUserIds].some((uid) =>
        affectedPlayers.has(uid),
      );
      if (!isMatchAffected) continue;

      for (const uid of [...winnerUserIds, ...loserUserIds]) {
        await getPlayerState(uid, completedAt);
      }

      const winnerStates = winnerUserIds.map((uid) => playerStates.get(uid)!);
      const loserStates = loserUserIds.map((uid) => playerStates.get(uid)!);

      const avgWinnerElo =
        winnerStates.reduce((sum, s) => sum + s.elo, 0) / winnerStates.length;
      const avgLoserElo =
        loserStates.reduce((sum, s) => sum + s.elo, 0) / loserStates.length;

      // Tính scoreRatio từ scoreDetails của match (nếu có)
      const matchScoreRatio = match.scoreDetails
        ? this.extractScoreRatio(
            match.scoreDetails as Record<string, unknown> | null | undefined,
            winnerParticipantId,
            match.participant1Id,
          )
        : undefined;

      for (let i = 0; i < winnerUserIds.length; i++) {
        const uid = winnerUserIds[i];
        const state = winnerStates[i];

        const result = this.eloEngineService.calculateElo(
          state.elo,
          avgLoserElo,
          true,
          state.matchesPlayed,
          state.winStreak,
          matchScoreRatio,
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
              eq(schema.eloHistoryLogs.userId, uid),
            ),
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
        state.peakElo = Math.max(state.peakElo, result.newElo);

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
          state.winStreak,
          matchScoreRatio,
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
              eq(schema.eloHistoryLogs.userId, uid),
            ),
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
        state.peakElo = Math.max(state.peakElo, finalLoserElo);

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
          peakElo: state.peakElo,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.userRanks.userId, uid),
            eq(schema.userRanks.categoryId, categoryId),
            eq(schema.userRanks.matchType, matchType),
            isNull(schema.userRanks.communityId),
          ),
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
      await this.recalculateEloChain(
        tx,
        playerIds,
        fromTime,
        categoryId,
        matchType,
      );
    });
  }

  /**
   * Entry point used by the ELO outbox worker (elo-outbox.processor.ts).
   * Loads the match + tournament context and calls processMatchResult with the
   * same arguments the old inline completion path used, so ELO semantics stay
   * identical while the caller moves out of the completion transaction.
   * Idempotent by design (advisory lock + unique elo_history_logs index).
   */
  async processMatchResultFromOutbox(matchId: string) {
    const footballResult =
      await this.footballTeamEloService?.processCompletedMatch(matchId);
    if (footballResult?.handled) return footballResult;

    const [match] = await this.db
      .select({
        winnerId: schema.matches.winnerId,
        participant1Id: schema.matches.participant1Id,
        participant2Id: schema.matches.participant2Id,
        tournamentId: schema.matches.tournamentId,
        stageId: schema.matches.stageId,
      })
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId))
      .limit(1);

    if (!match) {
      throw new Error(`Match ${matchId} not found for ELO outbox processing`);
    }
    if (!match.winnerId) {
      throw new Error(`Match ${matchId} has no winner — cannot compute ELO`);
    }

    const loserId =
      match.winnerId === match.participant1Id
        ? match.participant2Id
        : match.participant1Id;
    if (!loserId) {
      throw new Error(`Match ${matchId} has no loser — cannot compute ELO`);
    }

    const [tournament] = await this.db
      .select({
        categoryId: schema.tournaments.categoryId,
        tournamentMatchType: schema.tournaments.matchType,
        tournamentType: schema.tournaments.tournamentType,
        communityId: schema.tournaments.communityId,
        tournamentGenderRestriction: schema.tournaments.genderRestriction,
        divisionMatchType: schema.tournamentDivisions.matchType,
        divisionGenderRestriction: schema.tournamentDivisions.genderRestriction,
      })
      .from(schema.tournaments)
      .leftJoin(
        schema.tournamentStages,
        eq(schema.tournamentStages.id, match.stageId),
      )
      .leftJoin(
        schema.tournamentDivisions,
        eq(
          schema.tournamentDivisions.id,
          schema.tournamentStages.tournamentDivisionId,
        ),
      )
      .where(eq(schema.tournaments.id, match.tournamentId))
      .limit(1);

    if (!tournament) {
      throw new Error(
        `Tournament ${match.tournamentId} not found for ELO outbox processing`,
      );
    }

    const effectiveMatchType =
      tournament.divisionMatchType ?? tournament.tournamentMatchType;
    const effectiveGenderRestriction =
      tournament.divisionGenderRestriction ??
      tournament.tournamentGenderRestriction;
    const scope =
      tournament.tournamentType === 'CLUB' && tournament.communityId
        ? 'COMMUNITY'
        : 'PUBLIC';

    return this.processMatchResult(
      matchId,
      match.winnerId,
      loserId,
      tournament.categoryId,
      effectiveMatchType,
      scope,
      tournament.communityId || undefined,
      effectiveGenderRestriction || undefined,
    );
  }
}
