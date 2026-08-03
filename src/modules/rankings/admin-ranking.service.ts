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
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb, AppTx } from '../../database/db.types';
import * as schema from '../../database/schema';
import { RankingsService } from './rankings.service';
import {
  calculateAdminElo,
  resolveRankingVisibility,
} from './admin-elo-policy';
import {
  ADMIN_ELO_OPERATIONS,
  AdminEloOperation,
  AdminEloOperationDto,
  AdminEloQueryDto,
  RankingVisibilityStatus,
} from './dto/admin-elo-operation.dto';

type RankingScope = 'PUBLIC' | 'COMMUNITY';
type OperationResult = {
  operationId: string;
  operation: AdminEloOperation;
  previousElo: number | null;
  newElo: number | null;
  changedPoints: number | null;
  status: RankingVisibilityStatus;
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
  tierId?: string | null;
};
type StatusSnapshot = {
  id: string;
  status: string;
  expiresAt: Date | null;
};

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

@Injectable()
export class AdminRankingService {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly rankingsService: RankingsService,
  ) {}

  async listContexts(query: AdminEloQueryDto) {
    const limit = Math.min(query.limit ?? 50, 100);
    if (query.scope === 'COMMUNITY' && !query.communityId) {
      throw new BadRequestException(
        'communityId is required for COMMUNITY scope',
      );
    }
    if (query.scope === 'PUBLIC' && query.communityId) {
      throw new BadRequestException(
        'communityId is not allowed for PUBLIC scope',
      );
    }
    if (
      query.minElo !== undefined &&
      query.maxElo !== undefined &&
      query.minElo > query.maxElo
    ) {
      throw new BadRequestException('minElo cannot be greater than maxElo');
    }

    const rows =
      query.scope === 'COMMUNITY'
        ? await this.listCommunityContexts(query, limit)
        : await this.listPublicContexts(query, limit);

    const data = rows.map((row) => ({
      ...row,
      status: this.resolveStatus(row.status, row.statusExpiresAt),
    }));

    const last = data.at(-1);
    return {
      data,
      meta: {
        limit,
        hasMore: rows.length === limit,
        nextCursor: last
          ? Buffer.from(
              JSON.stringify({
                updatedAt: last.updatedAt.toISOString(),
                id: last.contextId,
              }),
            ).toString('base64url')
          : null,
      },
    };
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

      if (ratingOperation) {
        previousElo = rank.eloPoints;
        newElo = this.calculateNewElo(
          rank.eloPoints,
          normalized.operation,
          normalized.requestedValue,
        );
        changedPoints = newElo - previousElo;
        await this.updateRank(
          tx,
          normalized.scope,
          rank.id,
          newElo,
          rank.peakElo,
        );
        if (normalized.scope === 'PUBLIC') {
          await this.rankingsService.recalculateUserRankTier(
            tx,
            normalized.userId,
            normalized.categoryId,
            normalized.matchType,
            normalized.genderRestriction,
          );
        } else {
          await this.rankingsService.recalculateCommunityRankTier(
            tx,
            normalized.userId,
            normalized.categoryId,
            normalized.matchType,
            normalized.communityId,
            normalized.genderRestriction,
          );
        }
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
        })
        .where(eq(schema.adminEloOperations.id, reservation.id))
        .returning();

      if (!updatedOperation)
        throw new ConflictException('ELO_OPERATION_COMMIT_FAILED');
      return {
        operationId: updatedOperation.id,
        operation: normalized.operation,
        previousElo,
        newElo,
        changedPoints,
        status: nextStatus,
      } satisfies OperationResult;
    });

    await this.rankingsService.invalidateLeaderboardCacheForCategory(
      normalized.categoryId,
    );
    return result;
  }

  async getHistory(contextId: string, limit = 50) {
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);
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
        ),
      )
      .orderBy(
        desc(schema.adminEloOperations.createdAt),
        desc(schema.adminEloOperations.id),
      )
      .limit(normalizedLimit);

    return {
      data: rows,
      meta: {
        limit: normalizedLimit,
        hasMore: rows.length === normalizedLimit,
      },
    };
  }

  private async listPublicContexts(
    query: AdminEloQueryDto,
    limit: number,
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

  private async listCommunityContexts(
    query: AdminEloQueryDto,
    limit: number,
  ): Promise<AdminContextRow[]> {
    const communityConditions = [
      eq(schema.communityRankings.communityId, query.communityId as string),
      eq(schema.users.isMock, false),
      isNull(schema.users.deletedAt),
      query.categoryId
        ? eq(schema.communityRankings.categoryId, query.categoryId)
        : undefined,
      query.matchType
        ? eq(schema.communityRankings.matchType, query.matchType)
        : undefined,
      query.genderRestriction
        ? eq(
            schema.communityRankings.genderRestriction,
            query.genderRestriction,
          )
        : undefined,
      query.minElo !== undefined
        ? sql`${schema.communityRankings.eloPoints} >= ${query.minElo}`
        : undefined,
      query.maxElo !== undefined
        ? sql`${schema.communityRankings.eloPoints} <= ${query.maxElo}`
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
                    eq(schema.rankingContextStatuses.status, query.status),
                    or(
                      isNull(schema.rankingContextStatuses.expiresAt),
                      sql`${schema.rankingContextStatuses.expiresAt} > now()`,
                    ),
                  ),
                ),
            );
      communityConditions.push(statusFilter);
    }
    const rows = await this.db
      .select({
        contextId: schema.communityRankings.id,
        userId: schema.communityRankings.userId,
        email: schema.users.email,
        fullName: sql<string>`coalesce(${schema.profiles.fullName}, ${schema.users.email})`,
        avatarUrl: schema.profiles.avatarUrl,
        categoryId: schema.communityRankings.categoryId,
        scope: sql<RankingScope>`'COMMUNITY'`,
        communityId: schema.communityRankings.communityId,
        matchType: schema.communityRankings.matchType,
        genderRestriction: schema.communityRankings.genderRestriction,
        eloPoints: schema.communityRankings.eloPoints,
        matchesPlayed: schema.communityRankings.matchesPlayed,
        matchesWon: schema.communityRankings.matchesWon,
        winStreak: schema.communityRankings.winStreak,
        peakElo: sql<number>`1000`,
        updatedAt: schema.communityRankings.updatedAt,
        status: schema.rankingContextStatuses.status,
        statusExpiresAt: schema.rankingContextStatuses.expiresAt,
      })
      .from(schema.communityRankings)
      .innerJoin(
        schema.users,
        eq(schema.communityRankings.userId, schema.users.id),
      )
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .leftJoin(
        schema.rankingContextStatuses,
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
        ),
      )
      .where(and(...communityConditions))
      .orderBy(
        desc(schema.communityRankings.updatedAt),
        desc(schema.communityRankings.id),
      )
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
    const [communityContext] = await this.db
      .select({
        contextId: schema.communityRankings.id,
        userId: schema.communityRankings.userId,
        categoryId: schema.communityRankings.categoryId,
        scope: sql<RankingScope>`'COMMUNITY'`,
        communityId: schema.communityRankings.communityId,
        matchType: schema.communityRankings.matchType,
        genderRestriction: schema.communityRankings.genderRestriction,
      })
      .from(schema.communityRankings)
      .where(eq(schema.communityRankings.id, contextId))
      .limit(1);
    return communityContext;
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
    if (dto.scope === 'COMMUNITY') {
      const [community] = await tx
        .select({ id: schema.communities.id })
        .from(schema.communities)
        .where(eq(schema.communities.id, dto.communityId as string))
        .limit(1);
      if (!community) throw new NotFoundException('ELO_COMMUNITY_NOT_FOUND');
    }
  }

  private async findRankForUpdate(
    tx: AppTx,
    dto: AdminEloOperationDto,
  ): Promise<RankSnapshot | null> {
    const genderCondition = dto.genderRestriction
      ? eq(
          dto.scope === 'PUBLIC'
            ? schema.userRanks.genderRestriction
            : schema.communityRankings.genderRestriction,
          dto.genderRestriction,
        )
      : isNull(
          dto.scope === 'PUBLIC'
            ? schema.userRanks.genderRestriction
            : schema.communityRankings.genderRestriction,
        );
    if (dto.scope === 'PUBLIC') {
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
    const [rank] = await tx
      .select({
        id: schema.communityRankings.id,
        userId: schema.communityRankings.userId,
        categoryId: schema.communityRankings.categoryId,
        matchType: schema.communityRankings.matchType,
        genderRestriction: schema.communityRankings.genderRestriction,
        eloPoints: schema.communityRankings.eloPoints,
        matchesPlayed: schema.communityRankings.matchesPlayed,
        matchesWon: schema.communityRankings.matchesWon,
        winStreak: schema.communityRankings.winStreak,
        peakElo: sql<number>`1000`,
        shieldActive: sql<boolean>`false`,
        tierId: sql<string | null>`null`,
      })
      .from(schema.communityRankings)
      .where(
        and(
          eq(schema.communityRankings.userId, dto.userId),
          eq(schema.communityRankings.categoryId, dto.categoryId),
          eq(schema.communityRankings.communityId, dto.communityId as string),
          eq(schema.communityRankings.matchType, dto.matchType),
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
          eq(schema.rankingContextStatuses.scope, dto.scope),
          dto.communityId
            ? eq(schema.rankingContextStatuses.communityId, dto.communityId)
            : isNull(schema.rankingContextStatuses.communityId),
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
    scope: RankingScope,
    id: string,
    newElo: number,
    peakElo: number,
  ) {
    const now = new Date();
    if (scope === 'PUBLIC') {
      await tx
        .update(schema.userRanks)
        .set({
          eloPoints: newElo,
          peakElo: Math.max(peakElo, newElo),
          updatedAt: now,
          lastActiveAt: now,
          lastDecayAt: now,
        })
        .where(eq(schema.userRanks.id, id));
    } else {
      await tx
        .update(schema.communityRankings)
        .set({
          eloPoints: newElo,
          updatedAt: now,
          lastActiveAt: now,
          lastDecayAt: now,
        })
        .where(eq(schema.communityRankings.id, id));
    }
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
      reason: dto.reason.trim(),
    };
    if (normalized.scope === 'COMMUNITY' && !normalized.communityId)
      throw new BadRequestException('ELO_COMMUNITY_REQUIRED');
    if (normalized.scope === 'PUBLIC' && normalized.communityId)
      throw new BadRequestException('ELO_PUBLIC_COMMUNITY_FORBIDDEN');
    if (
      normalized.matchType === 'DOUBLES' ||
      normalized.matchType === 'MIXED_DOUBLES'
    )
      throw new BadRequestException('ELO_PAIR_OPERATION_NOT_SUPPORTED');
    const ratingOperation = this.isRatingOperation(operation);
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
    if (['HIDE', 'BAN'].includes(operation) && normalized.reason.length < 5)
      throw new BadRequestException('ELO_REASON_REQUIRED');
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

  private resolveStatus(
    status: string | null,
    expiresAt: Date | null,
  ): RankingVisibilityStatus {
    return resolveRankingVisibility(status, expiresAt);
  }
}
