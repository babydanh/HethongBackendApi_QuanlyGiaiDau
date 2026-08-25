import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb, AppTx } from '../../database/db.types';
import * as schema from '../../database/schema';
import {
  eq,
  desc,
  and,
  isNull,
  or,
  SQL,
  sql,
  gt,
  aliasedTable,
  inArray,
  notExists,
  AnyColumn,
} from 'drizzle-orm';
import { QueryRankingDto } from './dto/query-ranking.dto';

@Injectable()
export class RankingsRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  // Get public db instance (useful for starting transaction in service)
  getDbInstance() {
    return this.db;
  }

  async getLeaderboard(query: QueryRankingDto) {
    const {
      page = 1,
      limit = 50,
      cursor,
      categoryId,
      matchType,
      communityId,
      scope = 'PUBLIC',
      provinceCode,
      genderRestriction,
    } = query;
    let cursorValue: { eloPoints: number; id: string } | null = null;
    if (cursor) {
      try {
        cursorValue = JSON.parse(
          Buffer.from(cursor, 'base64url').toString('utf8'),
        ) as { eloPoints: number; id: string };
      } catch {
        cursorValue = null;
      }
    }
    const applyCursor = (eloColumn: AnyColumn, idColumn: AnyColumn) =>
      cursorValue
        ? sql`(${eloColumn} < ${cursorValue.eloPoints} OR (${eloColumn} = ${cursorValue.eloPoints} AND ${idColumn} < ${cursorValue.id}))`
        : undefined;

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
        conditions.push(
          eq(schema.pairRanks.genderRestriction, genderRestriction),
        );
      }
      if (communityId && scope === 'COMMUNITY') {
        conditions.push(eq(schema.pairRanks.communityId, communityId));
      } else {
        conditions.push(isNull(schema.pairRanks.communityId));
      }

      // Filter by province code of either of the players if requested
      if (provinceCode) {
        conditions.push(
          sql`(${profile1.provinceCode} = ${provinceCode} OR ${profile2.provinceCode} = ${provinceCode})`,
        );
      }

      conditions.push(
        notExists(
          this.db
            .select({ id: schema.rankingContextStatuses.id })
            .from(schema.rankingContextStatuses)
            .where(
              and(
                or(
                  eq(
                    schema.rankingContextStatuses.userId,
                    schema.pairRanks.user1Id,
                  ),
                  eq(
                    schema.rankingContextStatuses.userId,
                    schema.pairRanks.user2Id,
                  ),
                ),
                eq(
                  schema.rankingContextStatuses.categoryId,
                  schema.pairRanks.categoryId,
                ),
                eq(schema.rankingContextStatuses.scope, scope),
                scope === 'COMMUNITY'
                  ? eq(
                      schema.rankingContextStatuses.communityId,
                      schema.pairRanks.communityId,
                    )
                  : isNull(schema.rankingContextStatuses.communityId),
                eq(
                  schema.rankingContextStatuses.matchType,
                  schema.pairRanks.matchType,
                ),
                sql`coalesce(${schema.rankingContextStatuses.genderRestriction}, '') = coalesce(${schema.pairRanks.genderRestriction}, '')`,
                inArray(schema.rankingContextStatuses.status, [
                  'HIDDEN',
                  'BANNED',
                ]),
                or(
                  isNull(schema.rankingContextStatuses.expiresAt),
                  gt(schema.rankingContextStatuses.expiresAt, new Date()),
                ),
              ),
            ),
        ),
      );

      const whereClause = and(...conditions);

      const data = this.db
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
        .where(
          and(
            whereClause,
            applyCursor(schema.pairRanks.eloPoints, schema.pairRanks.id),
          ),
        )
        .orderBy(desc(schema.pairRanks.eloPoints), desc(schema.pairRanks.id))
        .limit(limit + 1)
        .$dynamic();
      const pairData = await data;
      const pairHasMore = pairData.length > limit;
      const pairItems = pairHasMore ? pairData.slice(0, limit) : pairData;
      const pairLast = pairItems.at(-1);

      return {
        data: pairItems,
        meta: {
          page,
          limit,
          nextCursor:
            pairHasMore && pairLast
              ? Buffer.from(
                  JSON.stringify({
                    eloPoints: pairLast.eloPoints,
                    id: pairLast.id,
                  }),
                ).toString('base64url')
              : null,
          hasMore: pairHasMore,
        },
      };
    }

    if (scope === 'COMMUNITY') {
      if (!communityId) {
        throw new BadRequestException(
          'communityId is required when scope is COMMUNITY',
        );
      }
      const conditions: SQL[] = [
        eq(schema.communityRankings.categoryId, categoryId),
        eq(schema.communityRankings.communityId, communityId),
        eq(schema.users.isMock, false),
        or(
          gt(schema.communityRankings.matchesPlayed, 0),
          eq(schema.communityRankings.adminLeaderboardEligible, true),
        ) as SQL,
        eq(schema.communityMembers.status, 'JOINED'),
      ];
      if (matchType) {
        conditions.push(eq(schema.communityRankings.matchType, matchType));
      }
      if (genderRestriction) {
        conditions.push(
          or(
            eq(schema.communityRankings.genderRestriction, genderRestriction),
            isNull(schema.communityRankings.genderRestriction),
          ) as SQL,
        );
      }

      if (provinceCode) {
        conditions.push(eq(schema.profiles.provinceCode, provinceCode));
      }

      conditions.push(
        notExists(
          this.db
            .select({ id: schema.rankingContextStatuses.id })
            .from(schema.rankingContextStatuses)
            .where(
              and(
                eq(
                  schema.rankingContextStatuses.userId,
                  schema.communityRankings.userId,
                ),
                eq(
                  schema.rankingContextStatuses.categoryId,
                  schema.communityRankings.categoryId,
                ),
                eq(schema.rankingContextStatuses.scope, 'COMMUNITY'),
                eq(
                  schema.rankingContextStatuses.communityId,
                  schema.communityRankings.communityId,
                ),
                eq(
                  schema.rankingContextStatuses.matchType,
                  schema.communityRankings.matchType,
                ),
                sql`coalesce(${schema.rankingContextStatuses.genderRestriction}, '') = coalesce(${schema.communityRankings.genderRestriction}, '')`,
                inArray(schema.rankingContextStatuses.status, [
                  'HIDDEN',
                  'BANNED',
                ]),
                or(
                  isNull(schema.rankingContextStatuses.expiresAt),
                  gt(schema.rankingContextStatuses.expiresAt, new Date()),
                ),
              ),
            ),
        ),
      );

      const whereClause = and(...conditions);

      const data = this.db
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
          user: {
            id: schema.users.id,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
          },
        })
        .from(schema.communityRankings)
        .innerJoin(
          schema.users,
          eq(schema.communityRankings.userId, schema.users.id),
        )
        .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
        .innerJoin(
          schema.communityMembers,
          and(
            eq(schema.communityRankings.userId, schema.communityMembers.userId),
            eq(
              schema.communityRankings.communityId,
              schema.communityMembers.communityId,
            ),
          ),
        )
        .where(
          and(
            whereClause,
            applyCursor(
              schema.communityRankings.eloPoints,
              schema.communityRankings.id,
            ),
          ),
        )
        .orderBy(
          desc(schema.communityRankings.eloPoints),
          desc(schema.communityRankings.id),
        )
        .limit(limit + 1)
        .$dynamic();
      const communityData = await data;
      const communityHasMore = communityData.length > limit;
      const communityItems = communityHasMore
        ? communityData.slice(0, limit)
        : communityData;
      const communityLast = communityItems.at(-1);

      return {
        data: communityItems,
        meta: {
          page,
          limit,
          nextCursor:
            communityHasMore && communityLast
              ? Buffer.from(
                  JSON.stringify({
                    eloPoints: communityLast.eloPoints,
                    id: communityLast.id,
                  }),
                ).toString('base64url')
              : null,
          hasMore: communityHasMore,
        },
      };
    } else {
      // PUBLIC scope
      const conditions: SQL[] = [
        eq(schema.userRanks.categoryId, categoryId),
        isNull(schema.userRanks.communityId),
        eq(schema.users.isMock, false),
        or(
          gt(schema.userRanks.matchesPlayed, 0),
          eq(schema.userRanks.adminLeaderboardEligible, true),
        ) as SQL,
      ];
      if (matchType) {
        conditions.push(eq(schema.userRanks.matchType, matchType));
      }
      if (genderRestriction) {
        conditions.push(
          eq(schema.userRanks.genderRestriction, genderRestriction),
        );
      }
      if (provinceCode) {
        conditions.push(eq(schema.profiles.provinceCode, provinceCode));
      }

      conditions.push(
        notExists(
          this.db
            .select({ id: schema.rankingContextStatuses.id })
            .from(schema.rankingContextStatuses)
            .where(
              and(
                eq(
                  schema.rankingContextStatuses.userId,
                  schema.userRanks.userId,
                ),
                eq(
                  schema.rankingContextStatuses.categoryId,
                  schema.userRanks.categoryId,
                ),
                eq(schema.rankingContextStatuses.scope, 'PUBLIC'),
                isNull(schema.rankingContextStatuses.communityId),
                eq(
                  schema.rankingContextStatuses.matchType,
                  schema.userRanks.matchType,
                ),
                sql`coalesce(${schema.rankingContextStatuses.genderRestriction}, '') = coalesce(${schema.userRanks.genderRestriction}, '')`,
                inArray(schema.rankingContextStatuses.status, [
                  'HIDDEN',
                  'BANNED',
                ]),
                or(
                  isNull(schema.rankingContextStatuses.expiresAt),
                  gt(schema.rankingContextStatuses.expiresAt, new Date()),
                ),
              ),
            ),
        ),
      );

      const whereClause = and(...conditions);

      const data = this.db
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
        .leftJoin(
          schema.eloTiers,
          eq(schema.userRanks.tierId, schema.eloTiers.id),
        )
        .where(
          and(
            whereClause,
            applyCursor(schema.userRanks.eloPoints, schema.userRanks.id),
          ),
        )
        .orderBy(desc(schema.userRanks.eloPoints), desc(schema.userRanks.id))
        .limit(limit + 1)
        .$dynamic();
      const publicData = await data;
      const publicHasMore = publicData.length > limit;
      const publicItems = publicHasMore
        ? publicData.slice(0, limit)
        : publicData;
      const publicLast = publicItems.at(-1);

      return {
        data: publicItems,
        meta: {
          page,
          limit,
          nextCursor:
            publicHasMore && publicLast
              ? Buffer.from(
                  JSON.stringify({
                    eloPoints: publicLast.eloPoints,
                    id: publicLast.id,
                  }),
                ).toString('base64url')
              : null,
          hasMore: publicHasMore,
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
        adminLeaderboardEligible: schema.userRanks.adminLeaderboardEligible,
        matchesWon: schema.userRanks.matchesWon,
        winStreak: schema.userRanks.winStreak,
        updatedAt: schema.userRanks.updatedAt,
        tierName: schema.eloTiers.name,
      })
      .from(schema.userRanks)
      .innerJoin(
        schema.categories,
        eq(schema.userRanks.categoryId, schema.categories.id),
      )
      .leftJoin(
        schema.eloTiers,
        eq(schema.userRanks.tierId, schema.eloTiers.id),
      )
      .where(
        and(
          eq(schema.userRanks.userId, userId),
          isNull(schema.userRanks.communityId),
          or(
            gt(schema.userRanks.matchesPlayed, 0),
            eq(schema.userRanks.adminLeaderboardEligible, true),
          ) as SQL,
          notExists(
            this.db
              .select({ id: schema.rankingContextStatuses.id })
              .from(schema.rankingContextStatuses)
              .where(
                and(
                  eq(
                    schema.rankingContextStatuses.userId,
                    schema.userRanks.userId,
                  ),
                  eq(
                    schema.rankingContextStatuses.categoryId,
                    schema.userRanks.categoryId,
                  ),
                  eq(schema.rankingContextStatuses.scope, 'PUBLIC'),
                  isNull(schema.rankingContextStatuses.communityId),
                  eq(
                    schema.rankingContextStatuses.matchType,
                    schema.userRanks.matchType,
                  ),
                  sql`coalesce(${schema.rankingContextStatuses.genderRestriction}, '') = coalesce(${schema.userRanks.genderRestriction}, '')`,
                  inArray(schema.rankingContextStatuses.status, [
                    'HIDDEN',
                    'BANNED',
                  ]),
                  or(
                    isNull(schema.rankingContextStatuses.expiresAt),
                    gt(schema.rankingContextStatuses.expiresAt, new Date()),
                  ),
                ),
              ),
          ),
        ),
      );

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
        adminLeaderboardEligible: schema.communityRankings.adminLeaderboardEligible,
        matchesWon: schema.communityRankings.matchesWon,
        winStreak: schema.communityRankings.winStreak,
        updatedAt: schema.communityRankings.updatedAt,
      })
      .from(schema.communityRankings)
      .innerJoin(
        schema.communities,
        eq(schema.communityRankings.communityId, schema.communities.id),
      )
      .innerJoin(
        schema.categories,
        eq(schema.communityRankings.categoryId, schema.categories.id),
      )
      .where(
        and(
          eq(schema.communityRankings.userId, userId),
          or(
            gt(schema.communityRankings.matchesPlayed, 0),
            eq(schema.communityRankings.adminLeaderboardEligible, true),
          ) as SQL,
          notExists(
            this.db
              .select({ id: schema.rankingContextStatuses.id })
              .from(schema.rankingContextStatuses)
              .where(
                and(
                  eq(
                    schema.rankingContextStatuses.userId,
                    schema.communityRankings.userId,
                  ),
                  eq(
                    schema.rankingContextStatuses.categoryId,
                    schema.communityRankings.categoryId,
                  ),
                  eq(schema.rankingContextStatuses.scope, 'COMMUNITY'),
                  eq(
                    schema.rankingContextStatuses.communityId,
                    schema.communityRankings.communityId,
                  ),
                  eq(
                    schema.rankingContextStatuses.matchType,
                    schema.communityRankings.matchType,
                  ),
                  sql`coalesce(${schema.rankingContextStatuses.genderRestriction}, '') = coalesce(${schema.communityRankings.genderRestriction}, '')`,
                  inArray(schema.rankingContextStatuses.status, [
                    'HIDDEN',
                    'BANNED',
                  ]),
                  or(
                    isNull(schema.rankingContextStatuses.expiresAt),
                    gt(schema.rankingContextStatuses.expiresAt, new Date()),
                  ),
                ),
              ),
          ),
        ),
      );

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
      matchType?: string;
      genderRestriction?: string;
      partnerId?: string;
      page?: number;
      limit?: number;
      cursor?: string;
    },
  ) {
    const {
      categoryId,
      scope = 'PUBLIC',
      communityId,
      matchType,
      genderRestriction,
      partnerId,
      page = 1,
      limit = 20,
      cursor,
    } = query;

    const conditions: SQL[] = [eq(schema.eloHistoryLogs.userId, userId)];

    // Do not expose stale/legacy ELO history created from a mock-involved match.
    // The write-side ranking guard blocks new rows; this read-side guard keeps
    // old data from appearing in dashboard/profile history.
    conditions.push(sql`NOT EXISTS (
      SELECT 1
      FROM matches mock_match
      LEFT JOIN tournament_participants mock_participant_1
        ON mock_participant_1.id = mock_match.participant1_id
      LEFT JOIN tournament_participants mock_participant_2
        ON mock_participant_2.id = mock_match.participant2_id
      WHERE mock_match.id = ${schema.eloHistoryLogs.matchId}
        AND (
          mock_participant_1.is_mock = TRUE
          OR mock_participant_2.is_mock = TRUE
          OR EXISTS (
            SELECT 1
            FROM tournament_rosters mock_roster
            INNER JOIN users mock_user
              ON mock_user.id = mock_roster.user_id
            WHERE mock_roster.participant_id IN (
              mock_match.participant1_id,
              mock_match.participant2_id
            )
              AND mock_user.is_mock = TRUE
          )
        )
    )`);

    if (categoryId) {
      conditions.push(eq(schema.eloHistoryLogs.categoryId, categoryId));
    }
    if (matchType) {
      conditions.push(
        sql`COALESCE(${schema.tournamentDivisions.matchType}, ${schema.tournaments.matchType}) = ${matchType}`,
      );
    }
    if (genderRestriction === '__NONE__') {
      conditions.push(
        sql`COALESCE(${schema.tournamentDivisions.genderRestriction}, ${schema.tournaments.genderRestriction}) IS NULL`,
      );
    } else if (genderRestriction) {
      conditions.push(
        sql`COALESCE(${schema.tournamentDivisions.genderRestriction}, ${schema.tournaments.genderRestriction}) = ${genderRestriction}`,
      );
    }
    if (partnerId) {
      conditions.push(
        sql`EXISTS (
          SELECT 1
          FROM match_players AS elo_scope_partner
          WHERE elo_scope_partner.match_id = ${schema.eloHistoryLogs.matchId}
            AND elo_scope_partner.user_id = ${partnerId}
        )`,
      );
    }

    if (scope === 'COMMUNITY') {
      if (!communityId) {
        throw new BadRequestException(
          'communityId is required when scope is COMMUNITY',
        );
      }
      conditions.push(eq(schema.tournaments.communityId, communityId));
      conditions.push(eq(schema.tournaments.tournamentType, 'CLUB'));
    } else {
      conditions.push(
        sql`(${schema.eloHistoryLogs.matchId} IS NULL OR ${schema.tournaments.tournamentType} = 'PUBLIC')`,
      );
    }

    const whereClause = and(...conditions);

    let historyWhere = whereClause;
    let historyCursor: { createdAt: string; id: string } | null = null;
    if (cursor) {
      try {
        historyCursor = JSON.parse(
          Buffer.from(cursor, 'base64url').toString('utf8'),
        ) as { createdAt: string; id: string };
      } catch {
        historyCursor = null;
      }
    }
    if (historyCursor) {
      const cursorDate = new Date(historyCursor.createdAt);
      historyWhere = and(
        whereClause,
        sql`(${schema.eloHistoryLogs.createdAt} < ${cursorDate} OR (${schema.eloHistoryLogs.createdAt} = ${cursorDate} AND ${schema.eloHistoryLogs.id} < ${historyCursor.id}))`,
      );
    }

    const data = this.db
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
        },
      })
      .from(schema.eloHistoryLogs)
      .leftJoin(
        schema.matches,
        eq(schema.eloHistoryLogs.matchId, schema.matches.id),
      )
      .leftJoin(
        schema.tournamentGroups,
        eq(schema.matches.groupId, schema.tournamentGroups.id),
      )
      .leftJoin(
        schema.tournamentStages,
        eq(schema.tournamentGroups.stageId, schema.tournamentStages.id),
      )
      .leftJoin(
        schema.tournamentDivisions,
        eq(
          schema.tournamentDivisions.id,
          schema.tournamentStages.tournamentDivisionId,
        ),
      )
      .leftJoin(
        schema.tournaments,
        eq(schema.tournamentStages.tournamentId, schema.tournaments.id),
      )
      .where(historyWhere)
      .orderBy(
        desc(schema.eloHistoryLogs.createdAt),
        desc(schema.eloHistoryLogs.id),
      )
      .limit(limit + 1)
      .$dynamic();
    const historyData = await data;
    const historyHasMore = historyData.length > limit;
    const historyItems = historyHasMore
      ? historyData.slice(0, limit)
      : historyData;
    const historyLast = historyItems.at(-1);

    const currentPlayer = aliasedTable(
      schema.matchPlayers,
      'elo_history_current_player',
    );
    const participant1 = aliasedTable(
      schema.tournamentParticipants,
      'elo_history_participant_1',
    );
    const participant2 = aliasedTable(
      schema.tournamentParticipants,
      'elo_history_participant_2',
    );
    const historyMatchIds = historyItems
      .map((item) => item.matchId)
      .filter((matchId): matchId is string => Boolean(matchId));
    const historyMatchRows =
      historyMatchIds.length > 0
        ? await this.db
            .select({
              matchId: schema.matches.id,
              currentParticipantId: currentPlayer.participantId,
              status: schema.matches.status,
              completedAt: schema.matches.completedAt,
              winnerId: schema.matches.winnerId,
              p1SetsWon: schema.matches.p1SetsWon,
              p2SetsWon: schema.matches.p2SetsWon,
              scoreDetails: schema.matches.scoreDetails,
              participant1: {
                id: participant1.id,
                teamName: participant1.teamName,
              },
              participant2: {
                id: participant2.id,
                teamName: participant2.teamName,
              },
            })
            .from(schema.matches)
            .leftJoin(
              currentPlayer,
              and(
                eq(currentPlayer.matchId, schema.matches.id),
                eq(currentPlayer.userId, userId),
              ),
            )
            .leftJoin(
              participant1,
              eq(participant1.id, schema.matches.participant1Id),
            )
            .leftJoin(
              participant2,
              eq(participant2.id, schema.matches.participant2Id),
            )
            .where(inArray(schema.matches.id, historyMatchIds))
        : [];

    const historyMatchById = new Map(
      historyMatchRows.map((row) => {
        const currentParticipant = row.currentParticipantId;
        const opponent =
          currentParticipant === row.participant1?.id
            ? row.participant2
            : row.participant1;
        const result = !row.winnerId
          ? 'DRAW'
          : !currentParticipant
            ? null
            : row.winnerId === currentParticipant
              ? 'WIN'
              : 'LOSS';
        return [
          row.matchId,
          {
            status: row.status,
            completedAt: row.completedAt,
            winnerId: row.winnerId,
            p1SetsWon: row.p1SetsWon,
            p2SetsWon: row.p2SetsWon,
            scoreDetails: row.scoreDetails,
            result,
            opponent: opponent
              ? { id: opponent.id, name: opponent.teamName }
              : null,
          },
        ];
      }),
    );
    const enrichedHistoryItems = historyItems.map((item) => {
      const details = item.matchId
        ? historyMatchById.get(item.matchId)
        : undefined;
      return {
        ...item,
        match: item.match ? { ...item.match, ...details } : (details ?? null),
      };
    });

    return {
      data: enrichedHistoryItems,
      meta: {
        page,
        limit,
        nextCursor:
          historyHasMore && historyLast
            ? Buffer.from(
                JSON.stringify({
                  createdAt: historyLast.createdAt.toISOString(),
                  id: historyLast.id,
                }),
              ).toString('base64url')
            : null,
        hasMore: historyHasMore,
      },
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
      if (!communityId)
        throw new BadRequestException(
          'communityId is required for COMMUNITY scope',
        );
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
        ? await tx
            .select()
            .from(schema.communityRankings)
            .where(and(...conditions))
            .for('update')
            .limit(1)
        : await tx
            .select()
            .from(schema.communityRankings)
            .where(and(...conditions))
            .limit(1);

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
        ? await tx
            .select()
            .from(schema.userRanks)
            .where(and(...conditions))
            .for('update')
            .limit(1)
        : await tx
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
    data: {
      eloPoints: number;
      matchesPlayed: number;
      matchesWon: number;
      winStreak: number;
      shieldActive?: boolean;
      peakElo?: number;
      lastActiveAt?: Date;
      lastDecayAt?: Date;
    },
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
    if (data.lastActiveAt !== undefined)
      setData.lastActiveAt = data.lastActiveAt;
    if (data.lastDecayAt !== undefined) setData.lastDecayAt = data.lastDecayAt;

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
    data: {
      eloPoints: number;
      matchesPlayed: number;
      matchesWon: number;
      winStreak: number;
      shieldActive?: boolean;
    },
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
          ...(data.shieldActive !== undefined && {
            shieldActive: data.shieldActive,
          }),
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
    const matchIds = [
      ...new Set(
        logs
          .map((log) => log.matchId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const tournamentByMatch = new Map<string, string | null>();

    if (matchIds.length > 0) {
      const matches = await tx
        .select({
          id: schema.matches.id,
          tournamentId: schema.matches.tournamentId,
        })
        .from(schema.matches)
        .where(inArray(schema.matches.id, matchIds));
      for (const match of matches)
        tournamentByMatch.set(match.id, match.tournamentId);
    }

    const enrichedLogs = logs.map((log) => ({
      ...log,
      tournamentId:
        log.tournamentId ??
        (log.matchId ? (tournamentByMatch.get(log.matchId) ?? null) : null),
    }));

    return tx
      .insert(schema.eloHistoryLogs)
      .values(enrichedLogs)
      .onConflictDoNothing();
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

  async updateUserRankTier(tx: AppTx, rankId: string, tierId: string | null) {
    return tx
      .update(schema.userRanks)
      .set({ tierId })
      .where(eq(schema.userRanks.id, rankId));
  }
}
