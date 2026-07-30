import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb, AppTx } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, desc, and, isNull, SQL, sql, gt, aliasedTable } from 'drizzle-orm';
import { QueryRankingDto } from './dto/query-ranking.dto';

@Injectable()
export class RankingsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  // Get public db instance (useful for starting transaction in service)
  getDbInstance() {
    return this.db;
  }

  async getLeaderboard(query: QueryRankingDto) {
    const { page = 1, limit = 50, categoryId, matchType, communityId, scope = 'PUBLIC', provinceCode, genderRestriction } = query;
    const offset = (page - 1) * limit;

    const isDoubles = matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';

    if (isDoubles) {
      // Setup aliases for pair ranks joining users and profiles
      const user1 = aliasedTable(schema.users, 'user1');
      const user2 = aliasedTable(schema.users, 'user2');
      const profile1 = aliasedTable(schema.profiles, 'profile1');
      const profile2 = aliasedTable(schema.profiles, 'profile2');

      const conditions: SQL[] = [
        eq(schema.pairRanks.categoryId, categoryId),
        eq(schema.pairRanks.scope, scope),
        gt(schema.pairRanks.matchesPlayed, 0),
        eq(user1.isMock, false),
        eq(user2.isMock, false),
      ];

      if (matchType) {
        conditions.push(eq(schema.pairRanks.matchType, matchType));
      }
      if (genderRestriction) {
        conditions.push(eq(schema.pairRanks.genderRestriction, genderRestriction));
      }
      if (communityId && scope === 'COMMUNITY') {
        conditions.push(eq(schema.pairRanks.communityId, communityId));
      } else {
        conditions.push(isNull(schema.pairRanks.communityId));
      }

      // Filter by province code of either of the players if requested
      if (provinceCode) {
        conditions.push(
          sql`(${profile1.provinceCode} = ${provinceCode} OR ${profile2.provinceCode} = ${provinceCode})`
        );
      }

      const whereClause = and(...conditions);

      const data = await this.db
        .select({
          id: schema.pairRanks.id,
          categoryId: schema.pairRanks.categoryId,
          communityId: schema.pairRanks.communityId,
          matchType: schema.pairRanks.matchType,
          genderRestriction: schema.pairRanks.genderRestriction,
          eloPoints: schema.pairRanks.eloPoints,
          matchesPlayed: schema.pairRanks.matchesPlayed,
          matchesWon: schema.pairRanks.matchesWon,
          winStreak: schema.pairRanks.winStreak,
          updatedAt: schema.pairRanks.updatedAt,
          user1: {
            id: user1.id,
            fullName: profile1.fullName,
            avatarUrl: profile1.avatarUrl,
          },
          user2: {
            id: user2.id,
            fullName: profile2.fullName,
            avatarUrl: profile2.avatarUrl,
          },
        })
        .from(schema.pairRanks)
        .innerJoin(user1, eq(schema.pairRanks.user1Id, user1.id))
        .innerJoin(user2, eq(schema.pairRanks.user2Id, user2.id))
        .leftJoin(profile1, eq(user1.id, profile1.userId))
        .leftJoin(profile2, eq(user2.id, profile2.userId))
        .where(whereClause)
        .orderBy(desc(schema.pairRanks.eloPoints))
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

    if (scope === 'COMMUNITY') {
      if (!communityId) {
        throw new BadRequestException('communityId is required when scope is COMMUNITY');
      }
      const conditions: SQL[] = [
        eq(schema.communityRankings.categoryId, categoryId),
        eq(schema.communityRankings.communityId, communityId),
        eq(schema.users.isMock, false),
        gt(schema.communityRankings.matchesPlayed, 0),
        eq(schema.communityMembers.status, 'JOINED'),
      ];
      if (matchType) {
        conditions.push(eq(schema.communityRankings.matchType, matchType));
      }
      if (genderRestriction) {
        conditions.push(eq(schema.communityRankings.genderRestriction, genderRestriction));
      }

      if (provinceCode) {
        conditions.push(eq(schema.profiles.provinceCode, provinceCode));
      }

      const whereClause = and(...conditions);

      const data = await this.db
        .select({
          id: schema.communityRankings.id,
          userId: schema.communityRankings.userId,
          categoryId: schema.communityRankings.categoryId,
          communityId: schema.communityRankings.communityId,
          matchType: schema.communityRankings.matchType,
          genderRestriction: schema.communityRankings.genderRestriction,
          eloPoints: schema.communityRankings.eloPoints,
          matchesPlayed: schema.communityRankings.matchesPlayed,
          matchesWon: schema.communityRankings.matchesWon,
          winStreak: schema.communityRankings.winStreak,
          updatedAt: schema.communityRankings.updatedAt,
          tier: {
            id: schema.eloTiers.id,
            name: schema.eloTiers.name,
          },
          user: {
            id: schema.users.id,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
          },
        })
        .from(schema.communityRankings)
        .innerJoin(schema.users, eq(schema.communityRankings.userId, schema.users.id))
        .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
        .leftJoin(schema.eloTiers, eq(schema.communityRankings.tierId, schema.eloTiers.id))
        .innerJoin(schema.communityMembers, and(
          eq(schema.communityRankings.userId, schema.communityMembers.userId),
          eq(schema.communityRankings.communityId, schema.communityMembers.communityId),
        ))
        .where(whereClause)
        .orderBy(desc(schema.communityRankings.eloPoints))
        .limit(limit)
        .offset(offset);

      return {
        data,
        meta: {
          page,
          limit,
        },
      };
    } else {
      // PUBLIC scope
      const conditions: SQL[] = [
        eq(schema.userRanks.categoryId, categoryId),
        isNull(schema.userRanks.communityId),
        eq(schema.users.isMock, false),
        gt(schema.userRanks.matchesPlayed, 0),
      ];
      if (matchType) {
        conditions.push(eq(schema.userRanks.matchType, matchType));
      }
      if (genderRestriction) {
        conditions.push(eq(schema.userRanks.genderRestriction, genderRestriction));
      }
      if (provinceCode) {
        conditions.push(eq(schema.profiles.provinceCode, provinceCode));
      }

      const whereClause = and(...conditions);

      const data = await this.db
        .select({
          id: schema.userRanks.id,
          userId: schema.userRanks.userId,
          categoryId: schema.userRanks.categoryId,
          matchType: schema.userRanks.matchType,
          genderRestriction: schema.userRanks.genderRestriction,
          eloPoints: schema.userRanks.eloPoints,
          matchesPlayed: schema.userRanks.matchesPlayed,
          matchesWon: schema.userRanks.matchesWon,
          winStreak: schema.userRanks.winStreak,
          updatedAt: schema.userRanks.updatedAt,
          tier: {
            id: schema.eloTiers.id,
            name: schema.eloTiers.name,
          },
          user: {
            id: schema.users.id,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
          },
        })
        .from(schema.userRanks)
        .innerJoin(schema.users, eq(schema.userRanks.userId, schema.users.id))
        .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
        .leftJoin(schema.eloTiers, eq(schema.userRanks.tierId, schema.eloTiers.id))
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
  }

  async getUserRankings(userId: string) {
    const [rankableUser] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, userId), eq(schema.users.isMock, false)))
      .limit(1);

    if (!rankableUser) {
      return { publicRanks: [], communityRanks: [] };
    }

    const publicRanks = await this.db
      .select({
        id: schema.userRanks.id,
        categoryId: schema.userRanks.categoryId,
        categoryName: schema.categories.name,
        matchType: schema.userRanks.matchType,
        genderRestriction: schema.userRanks.genderRestriction,
        eloPoints: schema.userRanks.eloPoints,
        shieldActive: schema.userRanks.shieldActive,
        peakElo: schema.userRanks.peakElo,
        lastActiveAt: schema.userRanks.lastActiveAt,
        matchesPlayed: schema.userRanks.matchesPlayed,
        matchesWon: schema.userRanks.matchesWon,
        winStreak: schema.userRanks.winStreak,
        updatedAt: schema.userRanks.updatedAt,
        tierName: schema.eloTiers.name,
      })
      .from(schema.userRanks)
      .innerJoin(schema.categories, eq(schema.userRanks.categoryId, schema.categories.id))
      .leftJoin(schema.eloTiers, eq(schema.userRanks.tierId, schema.eloTiers.id))
      .where(and(eq(schema.userRanks.userId, userId), isNull(schema.userRanks.communityId)));

    const communityRanks = await this.db
      .select({
        id: schema.communityRankings.id,
        communityId: schema.communityRankings.communityId,
        communityName: schema.communities.name,
        categoryId: schema.communityRankings.categoryId,
        categoryName: schema.categories.name,
        matchType: schema.communityRankings.matchType,
        genderRestriction: schema.communityRankings.genderRestriction,
        eloPoints: schema.communityRankings.eloPoints,
        peakElo: schema.communityRankings.peakElo,
        lastActiveAt: schema.communityRankings.lastActiveAt,
        matchesPlayed: schema.communityRankings.matchesPlayed,
        matchesWon: schema.communityRankings.matchesWon,
        winStreak: schema.communityRankings.winStreak,
        updatedAt: schema.communityRankings.updatedAt,
      })
      .from(schema.communityRankings)
      .innerJoin(schema.communities, eq(schema.communityRankings.communityId, schema.communities.id))
      .innerJoin(schema.categories, eq(schema.communityRankings.categoryId, schema.categories.id))
      .where(eq(schema.communityRankings.userId, userId));

    return {
      publicRanks,
      communityRanks,
    };
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
    const { categoryId, scope = 'PUBLIC', communityId, page = 1, limit = 20 } = query;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [eq(schema.eloHistoryLogs.userId, userId)];
    if (categoryId) {
      conditions.push(eq(schema.eloHistoryLogs.categoryId, categoryId));
    }

    if (scope === 'COMMUNITY') {
      if (!communityId) {
        throw new BadRequestException('communityId is required when scope is COMMUNITY');
      }
      conditions.push(eq(schema.tournaments.communityId, communityId));
      conditions.push(eq(schema.tournaments.tournamentType, 'CLUB'));
    } else {
      conditions.push(
        sql`(${schema.eloHistoryLogs.matchId} IS NULL OR ${schema.tournaments.tournamentType} = 'PUBLIC')`
      );
    }

    const whereClause = and(...conditions);

    const data = await this.db
      .select({
        id: schema.eloHistoryLogs.id,
        userId: schema.eloHistoryLogs.userId,
        categoryId: schema.eloHistoryLogs.categoryId,
        matchId: schema.eloHistoryLogs.matchId,
        reason: schema.eloHistoryLogs.reason,
        previousElo: schema.eloHistoryLogs.previousElo,
        newElo: schema.eloHistoryLogs.newElo,
        changedPoints: schema.eloHistoryLogs.changedPoints,
        createdAt: schema.eloHistoryLogs.createdAt,
        match: {
          id: schema.matches.id,
          tournamentId: schema.tournaments.id,
          tournamentName: schema.tournaments.name,
          tournamentType: schema.tournaments.tournamentType,
          communityId: schema.tournaments.communityId,
        }
      })
      .from(schema.eloHistoryLogs)
      .leftJoin(schema.matches, eq(schema.eloHistoryLogs.matchId, schema.matches.id))
      .leftJoin(schema.tournamentGroups, eq(schema.matches.groupId, schema.tournamentGroups.id))
      .leftJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
      .leftJoin(schema.tournaments, eq(schema.tournamentStages.tournamentId, schema.tournaments.id))
      .where(whereClause)
      .orderBy(desc(schema.eloHistoryLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      meta: {
        page,
        limit,
      }
    };
  }

  async getOrCreateUserRank(
    tx: AppTx,
    userId: string,
    categoryId: string,
    matchType: string,
    scope: 'PUBLIC' | 'COMMUNITY',
    communityId?: string,
    forUpdate: boolean = false,
    genderRestriction?: string,
  ) {
    if (scope === 'COMMUNITY') {
      if (!communityId) throw new BadRequestException('communityId is required for COMMUNITY scope');
      const conditions = [
        eq(schema.communityRankings.userId, userId),
        eq(schema.communityRankings.categoryId, categoryId),
        eq(schema.communityRankings.communityId, communityId),
        eq(schema.communityRankings.matchType, matchType),
        genderRestriction
          ? eq(schema.communityRankings.genderRestriction, genderRestriction)
          : isNull(schema.communityRankings.genderRestriction),
      ];
      
      const existing = forUpdate
        ? await tx.select().from(schema.communityRankings).where(and(...conditions)).for('update').limit(1)
        : await tx.select().from(schema.communityRankings).where(and(...conditions)).limit(1);

      if (existing.length > 0) return existing[0];

      const [newRank] = await tx
        .insert(schema.communityRankings)
        .values({
          userId,
          categoryId,
          communityId,
          matchType,
          genderRestriction: genderRestriction || null,
          eloPoints: 1000,
          matchesPlayed: 0,
          matchesWon: 0,
          winStreak: 0,
        })
        .returning();

      return newRank;
    } else {
      const conditions = [
        eq(schema.userRanks.userId, userId),
        eq(schema.userRanks.categoryId, categoryId),
        eq(schema.userRanks.matchType, matchType),
        isNull(schema.userRanks.communityId),
        genderRestriction
          ? eq(schema.userRanks.genderRestriction, genderRestriction)
          : isNull(schema.userRanks.genderRestriction),
      ];

      const existing = forUpdate
        ? await tx.select().from(schema.userRanks).where(and(...conditions)).for('update').limit(1)
        : await tx.select().from(schema.userRanks).where(and(...conditions)).limit(1);

      if (existing.length > 0) return existing[0];

      const [newRank] = await tx
        .insert(schema.userRanks)
        .values({
          userId,
          categoryId,
          matchType,
          genderRestriction: genderRestriction || null,
          eloPoints: 1000,
          matchesPlayed: 0,
          matchesWon: 0,
          winStreak: 0,
        })
        .returning();

      return newRank;
    }
  }

  async updateUserRank(
    tx: AppTx,
    id: string,
    data: { eloPoints: number; matchesPlayed: number; matchesWon: number; winStreak: number; shieldActive?: boolean; peakElo?: number; lastActiveAt?: Date },
    scope: 'PUBLIC' | 'COMMUNITY',
  ) {
    const setData: Record<string, unknown> = {
      eloPoints: data.eloPoints,
      matchesPlayed: data.matchesPlayed,
      matchesWon: data.matchesWon,
      winStreak: data.winStreak,
      updatedAt: new Date(),
    };
    if (data.peakElo !== undefined) setData.peakElo = data.peakElo;
    if (data.lastActiveAt !== undefined) setData.lastActiveAt = data.lastActiveAt;

    if (scope === 'COMMUNITY') {
      return tx
        .update(schema.communityRankings)
        .set(setData)
        .where(eq(schema.communityRankings.id, id))
        .returning();
    } else {
      return tx
        .update(schema.userRanks)
        .set(setData)
        .where(eq(schema.userRanks.id, id))
        .returning();
    }
  }

  private async _updateUserRank(
    tx: AppTx,
    id: string,
    data: { eloPoints: number; matchesPlayed: number; matchesWon: number; winStreak: number; shieldActive?: boolean },
    scope: 'PUBLIC' | 'COMMUNITY',
  ) {
    if (scope === 'COMMUNITY') {
      return tx
        .update(schema.communityRankings)
        .set({
          eloPoints: data.eloPoints,
          matchesPlayed: data.matchesPlayed,
          matchesWon: data.matchesWon,
          winStreak: data.winStreak,
          updatedAt: new Date(),
        })
        .where(eq(schema.communityRankings.id, id))
        .returning();
    } else {
      return tx
        .update(schema.userRanks)
        .set({
          eloPoints: data.eloPoints,
          matchesPlayed: data.matchesPlayed,
          matchesWon: data.matchesWon,
          winStreak: data.winStreak,
          ...(data.shieldActive !== undefined && { shieldActive: data.shieldActive }),
          updatedAt: new Date(),
        })
        .where(eq(schema.userRanks.id, id))
        .returning();
    }
  }

  async insertEloHistory(
    tx: AppTx,
    logs: (typeof schema.eloHistoryLogs.$inferInsert)[],
  ) {
    return tx.insert(schema.eloHistoryLogs).values(logs).onConflictDoNothing();
  }

  async getEloTiersByCategory(categoryId: string) {
    return this.db
      .select()
      .from(schema.eloTiers)
      .where(eq(schema.eloTiers.categoryId, categoryId));
  }

  async getUserProvinceCode(userId: string) {
    const profile = await this.db
      .select({ provinceCode: schema.profiles.provinceCode })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1)
      .then((rows) => rows[0]);
    return profile?.provinceCode || null;
  }

  async updateUserRankTier(
    tx: AppTx,
    rankId: string,
    tierId: string | null,
  ) {
    return tx
      .update(schema.userRanks)
      .set({ tierId })
      .where(eq(schema.userRanks.id, rankId));
  }
}

