import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  notExists,
  or,
  sql,
} from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb, AppTx } from '../../database/db.types';
import * as schema from '../../database/schema';
import { CursorPaginationHelper } from '../../common/helpers/cursor-pagination.helper';
import { RankingsService } from './rankings.service';
import {
  calculateAdminElo,
  resolveRankingVisibility,
  shouldGrantAdminLeaderboardBootstrap,
} from './admin-elo-policy';
import {
  ADMIN_ELO_OPERATIONS,
  AdminEloOperation,
  AdminEloOperationDto,
  AdminEloQueryDto,
  AdminEloPlayerQueryDto,
  AdminEloPlayerDetailQueryDto,
  RankingVisibilityStatus,
} from './dto/admin-elo-operation.dto';

type RankingScope = 'PUBLIC';
type OperationResult = {
  operationId: string;
  operation: AdminEloOperation;
  previousElo: number | null;
  newElo: number | null;
  changedPoints: number | null;
  status: RankingVisibilityStatus;
  leaderboardEligible: boolean;
};
type RankSnapshot = {
  id: string;
  userId: string;
  categoryId: string;
  matchType: string;
  genderRestriction: string | null;
  eloPoints: number;
  matchesPlayed: number;
  matchesWon: number;
  winStreak: number;
  peakElo: number;
  shieldActive?: boolean;
  adminLeaderboardEligible: boolean;
  tierId?: string | null;
};
type StatusSnapshot = {
  id: string;
  status: string;
  expiresAt: Date | null;
};

type AdminContextCursor = { updatedAt: Date; id: string };
type AdminHistoryCursor = { createdAt: Date; id: string };

type AdminContextRow = {
  contextId: string;
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  categoryId: string;
  scope: RankingScope;
  communityId: string | null;
  matchType: string;
  genderRestriction: string | null;
  eloPoints: number;
  matchesPlayed: number;
  matchesWon: number;
  winStreak: number;
  peakElo: number;
  updatedAt: Date;
  status: string | null;
  statusExpiresAt: Date | null;
};

type AdminPlayerRow = {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  contextCount: number;
  publicContextCount: number;
  communityContextCount: number;
  visibleContextCount: number;
  hiddenContextCount: number;
  bannedContextCount: number;
  eligibleContextCount: number;
  ineligibleContextCount: number;
  highestElo: number | null;
  lastUpdatedAt: Date | null;
};
type AdminPlayerSqlRow = {
  user_id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  context_count: number | string;
  public_context_count: number | string;
  community_context_count: number | string;
  visible_context_count: number | string;
  hidden_context_count: number | string;
  banned_context_count: number | string;
  eligible_context_count: number | string;
  ineligible_context_count: number | string;
  highest_elo: number | string | null;
  last_updated_at: Date | string;
};

type AdminPlayerContextDetail = {
  contextId: string;
  scope: RankingScope;
  communityId: string | null;
  communityName: string | null;
  categoryId: string;
  matchType: string;
  genderRestriction: string | null;
  eloPoints: number;
  matchesPlayed: number;
  matchesWon: number;
  winStreak: number;
  peakElo: number;
  tierName: string | null;
  status: RankingVisibilityStatus;
  statusExpiresAt: Date | null;
  leaderboardEligible: boolean;
  adminBootstrapEligible: boolean;
  updatedAt: Date;
};

type AdminPlayerDetail = {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
  };
  category: { id: string; name: string; slug: string };
  contexts: AdminPlayerContextDetail[];
  recentOperations: Array<{
    id: string;
    operation: AdminEloOperation;
    scope: RankingScope;
    communityId: string | null;
    matchType: string;
    previousElo: number | null;
    newElo: number | null;
    changedPoints: number | null;
    previousStatus: string | null;
    newStatus: string | null;
    previousLeaderboardEligible: boolean | null;
    newLeaderboardEligible: boolean | null;
    reason: string;
    createdAt: Date;
  }>;
};

@Injectable()
export class AdminRankingService {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly rankingsService: RankingsService,
    private readonly auditService: AuditService,
  ) {}

  async listContexts(query: AdminEloQueryDto) {
    this.assertPublicAdminQuery(query.scope, query.communityId);
    if (query.direction && query.direction !== 'next')
      throw new BadRequestException('ELO_CURSOR_DIRECTION_UNSUPPORTED');
    const limit = Math.min(query.limit ?? 50, 100);
    if (
      query.minElo !== undefined &&
      query.maxElo !== undefined &&
      query.minElo > query.maxElo
    ) {
      throw new BadRequestException('minElo cannot be greater than maxElo');
    }

    const cursor = this.decodeContextCursor(query.cursor);
    const rows = await this.listPublicContexts(query, limit + 1, cursor);
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((row) => ({
      ...row,
      status: this.resolveStatus(row.status, row.statusExpiresAt),
    }));

    const last = data.at(-1);
    return {
      data,
      meta: {
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? CursorPaginationHelper.encodeCursor({
                updatedAt: last.updatedAt.toISOString(),
                id: last.contextId,
              })
            : null,
      },
    };
  }

  async listPlayers(query: AdminEloPlayerQueryDto) {
    this.assertPublicAdminQuery(query.scope, query.communityId);
    await this.assertActiveCategory(query.categoryId);
    const limit = Math.min(query.limit ?? 50, 100);
    const cursor = this.decodePlayerCursor(query.cursor);
    const filters = [sql`category_id = ${query.categoryId}`];
    filters.push(sql`scope = 'PUBLIC'`);
    if (query.matchType) filters.push(sql`match_type = ${query.matchType}`);
    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;
      filters.push(sql`(email ILIKE ${search} OR full_name ILIKE ${search})`);
    }
    if (query.status) filters.push(sql`status = ${query.status}`);
    if (cursor) {
      filters.push(
        sql`(last_updated_at < ${cursor.updatedAt} OR (last_updated_at = ${cursor.updatedAt} AND user_id < ${cursor.id}))`,
      );
    }
    const rows = (await this.db.execute(sql`
      WITH           contexts AS (
        SELECT ur.user_id, ur.id AS context_id, ur.category_id, 'PUBLIC'::text AS scope,

          NULL::uuid AS community_id, ur.match_type, ur.elo_points, ur.matches_played, ur.admin_leaderboard_eligible, ur.updated_at,
          COALESCE(u.email, '') AS email,
          COALESCE(pr.full_name, u.email, '') AS full_name,
          pr.avatar_url,
          CASE WHEN st.status IS NULL OR (st.expires_at IS NOT NULL AND st.expires_at <= now()) THEN 'VISIBLE' ELSE st.status END AS status
        FROM user_ranks ur
        INNER JOIN users u ON u.id = ur.user_id AND u.is_mock = false AND u.deleted_at IS NULL
        LEFT JOIN profiles pr ON pr.user_id = u.id
        LEFT JOIN LATERAL (SELECT s.status, s.expires_at FROM ranking_context_statuses s WHERE s.user_id = ur.user_id AND s.category_id = ur.category_id AND s.scope = 'PUBLIC' AND s.community_id IS NULL AND s.match_type = ur.match_type AND COALESCE(s.gender_restriction, '') = COALESCE(ur.gender_restriction, '') LIMIT 1) st ON true
        INNER JOIN categories c ON c.id = ur.category_id AND COALESCE(c.category_config->>'isActive', 'true') <> 'false'
        WHERE ur.category_id = ${query.categoryId}
      )
      SELECT user_id, email, full_name, avatar_url,
        COUNT(*)::int AS context_count,
        COUNT(*) FILTER (WHERE scope = 'PUBLIC')::int AS public_context_count,
        0::int AS community_context_count,
        COUNT(*) FILTER (WHERE status = 'VISIBLE')::int AS visible_context_count,
        COUNT(*) FILTER (WHERE status = 'HIDDEN')::int AS hidden_context_count,
        COUNT(*) FILTER (WHERE status = 'BANNED')::int AS banned_context_count,
        COUNT(*) FILTER (WHERE matches_played > 0 OR admin_leaderboard_eligible)::int AS eligible_context_count,
        COUNT(*) FILTER (WHERE matches_played = 0 AND NOT admin_leaderboard_eligible)::int AS ineligible_context_count,
        MAX(elo_points)::int AS highest_elo,
        MAX(updated_at) AS last_updated_at
      FROM contexts
      WHERE ${sql.join(filters, sql` AND `)}
      GROUP BY user_id, email, full_name, avatar_url
      ORDER BY MAX(updated_at) DESC, user_id DESC
      LIMIT ${limit + 1}
    `)) as unknown as AdminPlayerSqlRow[];
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((row) => ({
      userId: row.user_id,
      email: row.email,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      contextCount: Number(row.context_count),
      publicContextCount: Number(row.public_context_count),
      communityContextCount: Number(row.community_context_count),
      visibleContextCount: Number(row.visible_context_count),
      hiddenContextCount: Number(row.hidden_context_count),
      bannedContextCount: Number(row.banned_context_count),
      eligibleContextCount: Number(row.eligible_context_count),
      ineligibleContextCount: Number(row.ineligible_context_count),
      highestElo: row.highest_elo === null ? null : Number(row.highest_elo),

      lastUpdatedAt: new Date(row.last_updated_at),
    }));
    const last = data.at(-1);
    return {
      data,
      meta: {
        limit,
        hasMore,
        nextCursor:
          hasMore && last && last.lastUpdatedAt
            ? CursorPaginationHelper.encodeCursor({
                updatedAt: last.lastUpdatedAt.toISOString(),
                id: last.userId,
              })
            : null,
      },
    };
  }

  async getPlayerDetail(
    userId: string,
    query: AdminEloPlayerDetailQueryDto,
  ): Promise<AdminPlayerDetail> {
    const category = await this.assertActiveCategory(query.categoryId);
    const rows = (await this.db.execute(sql`
      SELECT ur.id AS context_id, 'PUBLIC'::text AS scope, NULL::uuid AS community_id, NULL::text AS community_name,
        ur.category_id, ur.match_type, ur.gender_restriction, ur.elo_points, ur.matches_played, ur.matches_won, ur.win_streak, ur.peak_elo, ur.admin_leaderboard_eligible,
        COALESCE(t.name, NULL) AS tier_name, CASE WHEN st.status IS NULL OR (st.expires_at IS NOT NULL AND st.expires_at <= now()) THEN 'VISIBLE' ELSE st.status END AS status, st.expires_at AS status_expires_at, ur.updated_at
      FROM user_ranks ur
      LEFT JOIN elo_tiers t ON t.id = ur.tier_id
      LEFT JOIN LATERAL (SELECT s.status, s.expires_at FROM ranking_context_statuses s WHERE s.user_id = ur.user_id AND s.category_id = ur.category_id AND s.scope = 'PUBLIC' AND s.community_id IS NULL AND s.match_type = ur.match_type AND COALESCE(s.gender_restriction, '') = COALESCE(ur.gender_restriction, '') LIMIT 1) st ON true
      WHERE ur.user_id = ${userId} AND ur.category_id = ${query.categoryId}
      ORDER BY updated_at DESC
    `)) as unknown as Array<Record<string, unknown>>;
    const [user] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        fullName: sql<string>`coalesce(${schema.profiles.fullName}, ${schema.users.email})`,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          eq(schema.users.id, userId),
          eq(schema.users.isMock, false),
          isNull(schema.users.deletedAt),
        ),
      )
      .limit(1);
    if (!user || rows.length === 0)
      throw new NotFoundException('RANKING_PLAYER_NOT_FOUND');
    const operations = await this.db
      .select({
        id: schema.adminEloOperations.id,
        operation: schema.adminEloOperations.operation,
        scope: schema.adminEloOperations.scope,
        communityId: schema.adminEloOperations.communityId,
        matchType: schema.adminEloOperations.matchType,
        previousElo: schema.adminEloOperations.previousElo,
        newElo: schema.adminEloOperations.newElo,
        changedPoints: schema.adminEloOperations.changedPoints,
        previousStatus: schema.adminEloOperations.previousStatus,
        newStatus: schema.adminEloOperations.newStatus,
        previousLeaderboardEligible:
          schema.adminEloOperations.previousLeaderboardEligible,
        newLeaderboardEligible:
          schema.adminEloOperations.newLeaderboardEligible,
        reason: schema.adminEloOperations.reason,
        createdAt: schema.adminEloOperations.createdAt,
      })
      .from(schema.adminEloOperations)
      .where(
        and(
          eq(schema.adminEloOperations.userId, userId),
          eq(schema.adminEloOperations.categoryId, query.categoryId),
          eq(schema.adminEloOperations.scope, 'PUBLIC'),
          isNull(schema.adminEloOperations.communityId),
        ),
      )
      .orderBy(desc(schema.adminEloOperations.createdAt))
      .limit(20);
    return {
      user: {
        id: user.id,
        email: user.email ?? '',
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
      },
      category: { id: category.id, name: category.name, slug: category.slug },
      contexts: rows.map((row) => ({
        contextId: String(row.context_id),
        scope: String(row.scope) as RankingScope,
        communityId: row.community_id ? String(row.community_id) : null,
        communityName: row.community_name ? String(row.community_name) : null,
        categoryId: String(row.category_id),
        matchType: String(row.match_type),
        genderRestriction: row.gender_restriction
          ? String(row.gender_restriction)
          : null,
        eloPoints: Number(row.elo_points),
        matchesPlayed: Number(row.matches_played),
        matchesWon: Number(row.matches_won),
        winStreak: Number(row.win_streak),
        peakElo: Number(row.peak_elo),
        tierName: row.tier_name ? String(row.tier_name) : null,
        status: String(row.status) as RankingVisibilityStatus,
        statusExpiresAt: row.status_expires_at
          ? new Date(String(row.status_expires_at))
          : null,
        leaderboardEligible:
          Number(row.matches_played) > 0 ||
          row.admin_leaderboard_eligible === true ||
          String(row.admin_leaderboard_eligible) === 'true',
        adminBootstrapEligible:
          row.admin_leaderboard_eligible === true ||
          String(row.admin_leaderboard_eligible) === 'true',
        updatedAt: new Date(String(row.updated_at)),
      })),
      recentOperations: operations.map((operation) => ({
        ...operation,
        operation: operation.operation as AdminEloOperation,
        scope: operation.scope as RankingScope,
        createdAt: operation.createdAt,
      })),
    };
  }

  private assertPublicAdminQuery(
    scope: 'PUBLIC' | 'COMMUNITY' | undefined,
    communityId?: string,
    required = false,
  ) {
    if (
      (required && scope !== 'PUBLIC') ||
      (scope !== undefined && scope !== 'PUBLIC')
    ) {
      throw new BadRequestException('ELO_ADMIN_PUBLIC_ONLY');
    }
    if (communityId) {
      throw new BadRequestException('ELO_ADMIN_PUBLIC_ONLY');
    }
  }

  private async assertActiveCategory(categoryId: string) {
    const [category] = await this.db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        slug: schema.categories.slug,
        categoryConfig: schema.categories.categoryConfig,
      })
      .from(schema.categories)
      .where(eq(schema.categories.id, categoryId))
      .limit(1);
    const config =
      (category?.categoryConfig as Record<string, unknown> | null) ?? {};
    if (!category || config.isActive === false)
      throw new NotFoundException('RANKING_CATEGORY_NOT_ACTIVE');
    return category;
  }

  async applyOperation(
    adminUserId: string,
    dto: AdminEloOperationDto,
  ): Promise<OperationResult> {
    const normalized = this.normalizeAndValidate(dto);
    const fingerprint = this.getPayloadFingerprint(normalized);

    const existing = await this.db
      .select()
      .from(schema.adminEloOperations)
      .where(
        eq(schema.adminEloOperations.operationKey, normalized.operationKey),
      )
      .limit(1);
    if (existing[0])
      return this.resolveExistingOperation(existing[0], fingerprint);

    const result = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`admin-elo:${normalized.userId}:${normalized.categoryId}:${normalized.scope}:${normalized.communityId ?? ''}:${normalized.matchType}:${normalized.genderRestriction ?? ''}`}))`,
      );
      const [reservation] = await tx
        .insert(schema.adminEloOperations)
        .values({
          operationKey: normalized.operationKey,
          payloadFingerprint: fingerprint,
          adminUserId,
          userId: normalized.userId,
          categoryId: normalized.categoryId,
          scope: normalized.scope,
          communityId: normalized.communityId ?? null,
          matchType: normalized.matchType,
          genderRestriction: normalized.genderRestriction ?? null,
          operation: normalized.operation,
          requestedValue: normalized.requestedValue ?? null,
          reason: normalized.reason,
          expiresAt: normalized.expiresAt
            ? new Date(normalized.expiresAt)
            : null,
        })
        .onConflictDoNothing({ target: schema.adminEloOperations.operationKey })
        .returning({ id: schema.adminEloOperations.id });

      if (!reservation) {
        const [concurrent] = await tx
          .select()
          .from(schema.adminEloOperations)
          .where(
            eq(schema.adminEloOperations.operationKey, normalized.operationKey),
          )
          .limit(1);
        if (!concurrent)
          throw new ConflictException('ELO_OPERATION_RETRY_REQUIRED');
        return this.resolveExistingOperation(concurrent, fingerprint);
      }

      await this.assertValidTarget(tx, normalized);
      const rank = await this.findRankForUpdate(tx, normalized);
      if (!rank) throw new NotFoundException('ELO_RANK_CONTEXT_NOT_FOUND');

      const statusRow = await this.findStatusForUpdate(tx, normalized);
      const previousStatus = this.resolveStatus(
        statusRow?.status ?? null,
        statusRow?.expiresAt ?? null,
      );
      const ratingOperation = this.isRatingOperation(normalized.operation);
      let previousElo: number | null = null;
      let newElo: number | null = null;
      let changedPoints: number | null = null;
      let nextStatus = previousStatus;
      const previousLeaderboardEligible = rank.adminLeaderboardEligible;
      let nextLeaderboardEligible = previousLeaderboardEligible;

      if (ratingOperation) {
        previousElo = rank.eloPoints;
        newElo = this.calculateNewElo(
          rank.eloPoints,
          normalized.operation,
          normalized.requestedValue,
        );
        changedPoints = newElo - previousElo;
        if (
          shouldGrantAdminLeaderboardBootstrap(
            normalized.operation,
            rank.matchesPlayed,
            previousLeaderboardEligible,
          )
        ) {
          nextLeaderboardEligible = true;
        }
        await this.updateRank(
          tx,
          rank.id,
          newElo,
          rank.peakElo,
          nextLeaderboardEligible,
        );
        await this.rankingsService.recalculateUserRankTier(
          tx,
          normalized.userId,
          normalized.categoryId,
          normalized.matchType,
          normalized.genderRestriction,
        );
        await this.rankingsService.insertAdminEloHistory(tx, {
          userId: normalized.userId,
          categoryId: normalized.categoryId,
          matchId: null,
          tournamentId: null,
          reason: `ADMIN_${normalized.operation}`,
          previousElo,
          newElo,
          changedPoints,
        });
      } else {
        nextStatus =
          normalized.operation === 'HIDE'
            ? 'HIDDEN'
            : normalized.operation === 'BAN'
              ? 'BANNED'
              : 'VISIBLE';
        if (
          nextStatus !== 'VISIBLE' &&
          nextStatus !== 'HIDDEN' &&
          nextStatus !== 'BANNED'
        ) {
          throw new BadRequestException('ELO_STATUS_OPERATION_INVALID');
        }
        await this.upsertStatus(
          tx,
          normalized,
          nextStatus,
          adminUserId,
          statusRow,
        );
      }

      const [updatedOperation] = await tx
        .update(schema.adminEloOperations)
        .set({
          previousElo,
          newElo,
          changedPoints,
          previousStatus,
          newStatus: nextStatus,
          previousLeaderboardEligible,
          newLeaderboardEligible: nextLeaderboardEligible,
        })
        .where(eq(schema.adminEloOperations.id, reservation.id))
        .returning();

      if (!updatedOperation)
        throw new ConflictException('ELO_OPERATION_COMMIT_FAILED');
      await this.auditService.logCreate(
        tx,
        adminUserId,
        'admin_elo_operations',
        updatedOperation.id,
        {
          operationKey: updatedOperation.operationKey,
          targetUserId: updatedOperation.userId,
          categoryId: updatedOperation.categoryId,
          scope: updatedOperation.scope,
          communityId: updatedOperation.communityId,
          operation: updatedOperation.operation,
          previousElo: updatedOperation.previousElo,
          newElo: updatedOperation.newElo,
          changedPoints: updatedOperation.changedPoints,
          previousStatus: updatedOperation.previousStatus,
          newStatus: updatedOperation.newStatus,
          reason: updatedOperation.reason,
          expiresAt: updatedOperation.expiresAt,
        },
      );
      return {
        operationId: updatedOperation.id,
        operation: normalized.operation,
        previousElo,
        newElo,
        changedPoints,
        status: nextStatus,
        leaderboardEligible: nextLeaderboardEligible,
      } satisfies OperationResult;
    });

    await this.rankingsService.invalidateLeaderboardCacheForCategory(
      normalized.categoryId,
    );
    return result;
  }

  async getHistory(contextId: string, limit = 50, cursorValue?: string) {
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);
    const cursor = this.decodeHistoryCursor(cursorValue);
    const context = await this.findContextById(contextId);
    if (!context) throw new NotFoundException('ELO_RANK_CONTEXT_NOT_FOUND');
    const rows = await this.db
      .select({
        id: schema.adminEloOperations.id,
        operationKey: schema.adminEloOperations.operationKey,
        operation: schema.adminEloOperations.operation,
        requestedValue: schema.adminEloOperations.requestedValue,
        previousElo: schema.adminEloOperations.previousElo,
        newElo: schema.adminEloOperations.newElo,
        changedPoints: schema.adminEloOperations.changedPoints,
        previousStatus: schema.adminEloOperations.previousStatus,
        newStatus: schema.adminEloOperations.newStatus,
        previousLeaderboardEligible:
          schema.adminEloOperations.previousLeaderboardEligible,
        newLeaderboardEligible:
          schema.adminEloOperations.newLeaderboardEligible,
        reason: schema.adminEloOperations.reason,
        expiresAt: schema.adminEloOperations.expiresAt,
        adminUserId: schema.adminEloOperations.adminUserId,
        createdAt: schema.adminEloOperations.createdAt,
      })
      .from(schema.adminEloOperations)
      .where(
        and(
          eq(schema.adminEloOperations.userId, context.userId),
          eq(schema.adminEloOperations.categoryId, context.categoryId),
          eq(schema.adminEloOperations.scope, context.scope),
          context.communityId
            ? eq(schema.adminEloOperations.communityId, context.communityId)
            : isNull(schema.adminEloOperations.communityId),
          eq(schema.adminEloOperations.matchType, context.matchType),
          context.genderRestriction
            ? eq(
                schema.adminEloOperations.genderRestriction,
                context.genderRestriction,
              )
            : isNull(schema.adminEloOperations.genderRestriction),
          cursor
            ? sql`(${schema.adminEloOperations.createdAt} < ${cursor.createdAt} OR (${schema.adminEloOperations.createdAt} = ${cursor.createdAt} AND ${schema.adminEloOperations.id} < ${cursor.id}))`
            : undefined,
        ),
      )
      .orderBy(
        desc(schema.adminEloOperations.createdAt),
        desc(schema.adminEloOperations.id),
      )
      .limit(normalizedLimit + 1);
    const hasMore = rows.length > normalizedLimit;
    const data = rows.slice(0, normalizedLimit);
    const last = data.at(-1);

    return {
      data,
      meta: {
        limit: normalizedLimit,
        hasMore,
        nextCursor:
          hasMore && last
            ? CursorPaginationHelper.encodeCursor({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      },
    };
  }

  private async listPublicContexts(
    query: AdminEloQueryDto,
    limit: number,
    cursor?: AdminContextCursor,
  ): Promise<AdminContextRow[]> {
    const genderCondition = query.genderRestriction
      ? eq(schema.userRanks.genderRestriction, query.genderRestriction)
      : query.genderRestriction === undefined
        ? undefined
        : isNull(schema.userRanks.genderRestriction);
    const conditions = [
      isNull(schema.userRanks.communityId),
      eq(schema.users.isMock, false),
      isNull(schema.users.deletedAt),
      cursor
        ? sql`(${schema.userRanks.updatedAt} < ${cursor.updatedAt} OR (${schema.userRanks.updatedAt} = ${cursor.updatedAt} AND ${schema.userRanks.id} < ${cursor.id}))`
        : undefined,
      query.categoryId
        ? eq(schema.userRanks.categoryId, query.categoryId)
        : undefined,
      query.matchType
        ? eq(schema.userRanks.matchType, query.matchType)
        : undefined,
      genderCondition,
      query.minElo !== undefined
        ? sql`${schema.userRanks.eloPoints} >= ${query.minElo}`
        : undefined,
      query.maxElo !== undefined
        ? sql`${schema.userRanks.eloPoints} <= ${query.maxElo}`
        : undefined,
      query.search
        ? or(
            ilike(schema.users.email, `%${query.search.trim()}%`),
            ilike(schema.profiles.fullName, `%${query.search.trim()}%`),
          )
        : undefined,
    ].filter(
      (value): value is NonNullable<typeof value> => value !== undefined,
    );
    if (query.status) {
      const statusFilter =
        query.status === 'VISIBLE'
          ? notExists(
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
                      sql`${schema.rankingContextStatuses.expiresAt} > now()`,
                    ),
                  ),
                ),
            )
          : exists(
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
                    eq(schema.rankingContextStatuses.status, query.status),
                    or(
                      isNull(schema.rankingContextStatuses.expiresAt),
                      sql`${schema.rankingContextStatuses.expiresAt} > now()`,
                    ),
                  ),
                ),
            );
      conditions.push(statusFilter);
    }
    const rows = await this.db
      .select({
        contextId: schema.userRanks.id,
        userId: schema.userRanks.userId,
        email: schema.users.email,
        fullName: sql<string>`coalesce(${schema.profiles.fullName}, ${schema.users.email})`,
        avatarUrl: schema.profiles.avatarUrl,
        categoryId: schema.userRanks.categoryId,
        scope: sql<RankingScope>`'PUBLIC'`,
        communityId: sql<string | null>`null`,
        matchType: schema.userRanks.matchType,
        genderRestriction: schema.userRanks.genderRestriction,
        eloPoints: schema.userRanks.eloPoints,
        matchesPlayed: schema.userRanks.matchesPlayed,
        matchesWon: schema.userRanks.matchesWon,
        winStreak: schema.userRanks.winStreak,
        peakElo: schema.userRanks.peakElo,
        updatedAt: schema.userRanks.updatedAt,
        status: schema.rankingContextStatuses.status,
        statusExpiresAt: schema.rankingContextStatuses.expiresAt,
      })
      .from(schema.userRanks)
      .innerJoin(schema.users, eq(schema.userRanks.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .leftJoin(
        schema.rankingContextStatuses,
        and(
          eq(schema.rankingContextStatuses.userId, schema.userRanks.userId),
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
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(schema.userRanks.updatedAt), desc(schema.userRanks.id))
      .limit(limit);
    return rows;
  }

  private async findContextById(contextId: string) {
    const [publicContext] = await this.db
      .select({
        contextId: schema.userRanks.id,
        userId: schema.userRanks.userId,
        categoryId: schema.userRanks.categoryId,
        scope: sql<RankingScope>`'PUBLIC'`,
        communityId: sql<string | null>`null`,
        matchType: schema.userRanks.matchType,
        genderRestriction: schema.userRanks.genderRestriction,
      })
      .from(schema.userRanks)
      .where(eq(schema.userRanks.id, contextId))
      .limit(1);
    if (publicContext) return publicContext;
    return undefined;
  }

  private async assertValidTarget(tx: AppTx, dto: AdminEloOperationDto) {
    const [user] = await tx
      .select({
        id: schema.users.id,
        isMock: schema.users.isMock,
        deletedAt: schema.users.deletedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, dto.userId))
      .limit(1);
    if (!user || user.isMock || user.deletedAt)
      throw new NotFoundException('ELO_TARGET_USER_NOT_FOUND');
    const [category] = await tx
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(eq(schema.categories.id, dto.categoryId))
      .limit(1);
    if (!category) throw new NotFoundException('ELO_CATEGORY_NOT_FOUND');
  }

  private async findRankForUpdate(
    tx: AppTx,
    dto: AdminEloOperationDto,
  ): Promise<RankSnapshot | null> {
    const genderCondition = dto.genderRestriction
      ? eq(schema.userRanks.genderRestriction, dto.genderRestriction)
      : isNull(schema.userRanks.genderRestriction);
    const [rank] = await tx
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
        peakElo: schema.userRanks.peakElo,
        shieldActive: schema.userRanks.shieldActive,
        adminLeaderboardEligible: schema.userRanks.adminLeaderboardEligible,
        tierId: schema.userRanks.tierId,
      })
      .from(schema.userRanks)
      .where(
        and(
          eq(schema.userRanks.userId, dto.userId),
          eq(schema.userRanks.categoryId, dto.categoryId),
          eq(schema.userRanks.matchType, dto.matchType),
          isNull(schema.userRanks.communityId),
          genderCondition,
        ),
      )
      .for('update')
      .limit(1);
    return rank ?? null;
  }

  private async findStatusForUpdate(
    tx: AppTx,
    dto: AdminEloOperationDto,
  ): Promise<StatusSnapshot | null> {
    const [row] = await tx
      .select({
        id: schema.rankingContextStatuses.id,
        status: schema.rankingContextStatuses.status,
        expiresAt: schema.rankingContextStatuses.expiresAt,
      })
      .from(schema.rankingContextStatuses)
      .where(
        and(
          eq(schema.rankingContextStatuses.userId, dto.userId),
          eq(schema.rankingContextStatuses.categoryId, dto.categoryId),
          eq(schema.rankingContextStatuses.scope, 'PUBLIC'),
          isNull(schema.rankingContextStatuses.communityId),
          eq(schema.rankingContextStatuses.matchType, dto.matchType),
          dto.genderRestriction
            ? eq(
                schema.rankingContextStatuses.genderRestriction,
                dto.genderRestriction,
              )
            : isNull(schema.rankingContextStatuses.genderRestriction),
        ),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  private async updateRank(
    tx: AppTx,
    id: string,
    newElo: number,
    peakElo: number,
    adminLeaderboardEligible: boolean,
  ) {
    const now = new Date();
    await tx
      .update(schema.userRanks)
      .set({
        eloPoints: newElo,
        peakElo: Math.max(peakElo, newElo),
        adminLeaderboardEligible,
        updatedAt: now,
      })
      .where(eq(schema.userRanks.id, id));
  }

  private async upsertStatus(
    tx: AppTx,
    dto: AdminEloOperationDto,
    status: RankingVisibilityStatus,
    adminUserId: string,
    existing: StatusSnapshot | null,
  ) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (existing) {
      await tx
        .update(schema.rankingContextStatuses)
        .set({
          status,
          reason: dto.reason,
          expiresAt,
          changedBy: adminUserId,
          updatedAt: new Date(),
        })
        .where(eq(schema.rankingContextStatuses.id, existing.id));
      return;
    }
    await tx.insert(schema.rankingContextStatuses).values({
      userId: dto.userId,
      categoryId: dto.categoryId,
      scope: dto.scope,
      communityId: dto.communityId ?? null,
      matchType: dto.matchType,
      genderRestriction: dto.genderRestriction ?? null,
      status,
      reason: dto.reason,
      expiresAt,
      changedBy: adminUserId,
    });
  }

  private normalizeAndValidate(
    dto: AdminEloOperationDto,
  ): AdminEloOperationDto {
    const operation = dto.operation;
    if (!ADMIN_ELO_OPERATIONS.includes(operation))
      throw new BadRequestException('ELO_OPERATION_INVALID');
    const normalized = {
      ...dto,
      operationKey: dto.operationKey.trim(),
      matchType: dto.matchType.trim(),
      genderRestriction: dto.genderRestriction?.trim() || undefined,
      reason: dto.reason.trim(),
    };
    if (
      normalized.operationKey.length < 16 ||
      normalized.operationKey.length > 128
    )
      throw new BadRequestException('ELO_OPERATION_KEY_INVALID');
    if (normalized.matchType.length === 0)
      throw new BadRequestException('ELO_MATCH_TYPE_REQUIRED');
    if (normalized.reason.length < 5)
      throw new BadRequestException('ELO_REASON_REQUIRED');
    this.assertPublicAdminQuery(normalized.scope, normalized.communityId, true);
    const ratingOperation = this.isRatingOperation(operation);
    if (
      (normalized.matchType === 'DOUBLES' ||
        normalized.matchType === 'MIXED_DOUBLES') &&
      ratingOperation
    )
      throw new BadRequestException('ELO_PAIR_OPERATION_NOT_SUPPORTED');
    if (ratingOperation && normalized.expiresAt)
      throw new BadRequestException('ELO_EXPIRY_NOT_ALLOWED');
    if (
      !ratingOperation &&
      operation !== 'BAN' &&
      operation !== 'HIDE' &&
      operation !== 'RESTORE'
    )
      throw new BadRequestException('ELO_OPERATION_INVALID');
    if (
      ['ADD', 'SUBTRACT', 'SET'].includes(operation) &&
      (normalized.requestedValue === undefined ||
        normalized.requestedValue <= 0)
    )
      throw new BadRequestException('ELO_VALUE_REQUIRED');
    if (
      ['RESET', 'HIDE', 'BAN', 'RESTORE'].includes(operation) &&
      normalized.requestedValue !== undefined
    )
      throw new BadRequestException('ELO_VALUE_NOT_ALLOWED');
    if (operation === 'RESTORE' && normalized.expiresAt)
      throw new BadRequestException('ELO_EXPIRY_NOT_ALLOWED');
    if (
      normalized.expiresAt &&
      new Date(normalized.expiresAt).getTime() <= Date.now()
    )
      throw new BadRequestException('ELO_EXPIRY_MUST_BE_FUTURE');
    return normalized;
  }

  private getPayloadFingerprint(dto: AdminEloOperationDto) {
    const canonical = JSON.stringify({
      userId: dto.userId,
      categoryId: dto.categoryId,
      scope: dto.scope,
      communityId: dto.communityId ?? null,
      matchType: dto.matchType,
      genderRestriction: dto.genderRestriction ?? null,
      operation: dto.operation,
      requestedValue: dto.requestedValue ?? null,
      reason: dto.reason,
      expiresAt: dto.expiresAt ?? null,
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private resolveExistingOperation(
    operation: typeof schema.adminEloOperations.$inferSelect,
    fingerprint: string,
  ): OperationResult {
    if (operation.payloadFingerprint !== fingerprint)
      throw new ConflictException('IDEMPOTENCY_CONFLICT');
    const status = resolveRankingVisibility(
      operation.newStatus,
      operation.expiresAt,
    );
    return {
      operationId: operation.id,
      operation: operation.operation as AdminEloOperation,
      previousElo: operation.previousElo,
      newElo: operation.newElo,
      changedPoints: operation.changedPoints,
      status,
      leaderboardEligible: operation.newLeaderboardEligible ?? false,
    };
  }

  private calculateNewElo(
    current: number,
    operation: AdminEloOperation,
    requestedValue: number | undefined,
  ) {
    try {
      return calculateAdminElo(current, operation, requestedValue);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'ELO_VALUE_REQUIRED') {
        throw new BadRequestException(error.message);
      }
      throw new BadRequestException('ELO_CANNOT_BE_NEGATIVE');
    }
  }

  private isRatingOperation(operation: AdminEloOperation) {
    return (
      operation === 'ADD' ||
      operation === 'SUBTRACT' ||
      operation === 'SET' ||
      operation === 'RESET'
    );
  }

  private decodeContextCursor(cursor?: string): AdminContextCursor | undefined {
    if (!cursor) return undefined;
    const decoded = CursorPaginationHelper.decodeCursor<{
      updatedAt: string;
      id: string;
    }>(cursor);
    if (
      !decoded ||
      typeof decoded.id !== 'string' ||
      typeof decoded.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(decoded.updatedAt))
    ) {
      throw new BadRequestException('ELO_CURSOR_INVALID');
    }
    return { updatedAt: new Date(decoded.updatedAt), id: decoded.id };
  }

  private decodePlayerCursor(
    cursor?: string,
  ): { updatedAt: Date; id: string } | undefined {
    if (!cursor) return undefined;
    const decoded = CursorPaginationHelper.decodeCursor<{
      updatedAt: string;
      id: string;
    }>(cursor);
    if (
      !decoded ||
      typeof decoded.id !== 'string' ||
      typeof decoded.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(decoded.updatedAt))
    ) {
      throw new BadRequestException('ELO_CURSOR_INVALID');
    }
    return { updatedAt: new Date(decoded.updatedAt), id: decoded.id };
  }

  private decodeHistoryCursor(cursor?: string): AdminHistoryCursor | undefined {
    if (!cursor) return undefined;
    const decoded = CursorPaginationHelper.decodeCursor<{
      createdAt: string;
      id: string;
    }>(cursor);
    if (
      !decoded ||
      typeof decoded.id !== 'string' ||
      typeof decoded.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(decoded.createdAt))
    ) {
      throw new BadRequestException('ELO_CURSOR_INVALID');
    }
    return { createdAt: new Date(decoded.createdAt), id: decoded.id };
  }

  private resolveStatus(
    status: string | null,
    expiresAt: Date | null,
  ): RankingVisibilityStatus {
    return resolveRankingVisibility(status, expiresAt);
  }
}
