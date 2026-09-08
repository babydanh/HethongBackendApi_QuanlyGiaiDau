import { createHash } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb, AppDbOrTx, AppTx } from '../../database/db.types';
import * as schema from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { selectScoringPreset } from './scoring-preset';

type MatchType = 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
type SessionStatus = 'OPEN' | 'LIVE' | 'CLOSED' | 'ENDED' | 'CANCELLED';

export interface ClubMatchWarning {
  code:
    | 'PLAYER_ALREADY_ACTIVE'
    | 'REPEATED_PAIRING'
    | 'AVOIDED_PLAYER'
    | 'PARTNER_PREFERENCE_NOT_MATCHED'
    | 'OPPONENT_PREFERENCE_NOT_MATCHED';
  userIds: string[];
}

function normalizeIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
  ).toString('base64url');
}

function decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { createdAt?: unknown; id?: unknown };
    const createdAt = new Date(String(parsed.createdAt ?? ''));
    if (
      Number.isNaN(createdAt.getTime()) ||
      typeof parsed.id !== 'string' ||
      parsed.id.length === 0
    ) {
      return null;
    }
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

@Injectable()
export class ClubMatchSessionsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
  ) {}

  getDb(): AppDb {
    return this.db;
  }

  async findCommunityContext(
    communityId: string,
    actorId: string | undefined,
    tx: AppDbOrTx = this.db,
  ) {
    const [row] = await tx
      .select({
        id: schema.communities.id,
        name: schema.communities.name,
        status: schema.communities.status,
        categoryId: schema.communitySports.categoryId,
        categorySlug: schema.categories.slug,
        memberRole: schema.communityMembers.role,
        memberStatus: schema.communityMembers.status,
        memberMatchCreationEnabled:
          schema.communitySocialSettings.memberMatchCreationEnabled,
        memberMatchScoringEnabled:
          schema.communitySocialSettings.memberMatchScoringEnabled,
        memberMatchDeletionEnabled:
          schema.communitySocialSettings.memberMatchDeletionEnabled,
        matchScoringPresets: schema.communitySocialSettings.matchScoringPresets,
      })
      .from(schema.communities)
      .leftJoin(
        schema.communitySports,
        eq(schema.communitySports.communityId, schema.communities.id),
      )
      .leftJoin(
        schema.categories,
        eq(schema.categories.id, schema.communitySports.categoryId),
      )
      .leftJoin(
        schema.communityMembers,
        actorId
          ? and(
              eq(schema.communityMembers.communityId, schema.communities.id),
              eq(schema.communityMembers.userId, actorId),
            )
          : sql`false`,
      )
      .leftJoin(
        schema.communitySocialSettings,
        eq(
          schema.communitySocialSettings.communityId,
          schema.communities.id,
        ),
      )
      .where(
        and(
          eq(schema.communities.id, communityId),
          isNull(schema.communities.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findMembership(
    communityId: string,
    userId: string,
    tx: AppDbOrTx = this.db,
  ) {
    const [row] = await tx
      .select()
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.communityId, communityId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findSession(id: string, tx: AppDbOrTx = this.db) {
    const [row] = await tx
      .select({
        session: schema.clubMatchSessions,
        communityName: schema.communities.name,
        categoryName: schema.categories.name,
        categorySlug: schema.categories.slug,
        categoryConfig: schema.categories.categoryConfig,
      })
      .from(schema.clubMatchSessions)
      .innerJoin(
        schema.communities,
        eq(schema.communities.id, schema.clubMatchSessions.communityId),
      )
      .innerJoin(
        schema.categories,
        eq(schema.categories.id, schema.clubMatchSessions.categoryId),
      )
      .where(
        and(
          eq(schema.clubMatchSessions.id, id),
          isNull(schema.clubMatchSessions.deletedAt),
          isNull(schema.communities.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findSessionForUpdate(id: string, tx: AppTx) {
    const [row] = await tx
      .select()
      .from(schema.clubMatchSessions)
      .where(
        and(
          eq(schema.clubMatchSessions.id, id),
          isNull(schema.clubMatchSessions.deletedAt),
        ),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  async countActiveParticipants(sessionId: string, tx: AppTx) {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.clubMatchSessionParticipants)
      .where(
        and(
          eq(schema.clubMatchSessionParticipants.sessionId, sessionId),
          eq(schema.clubMatchSessionParticipants.status, 'ACTIVE'),
        ),
      );
    return Number(row?.count ?? 0);
  }

  async createSession(input: {
    communityId: string;
    categoryId: string;
    createdBy: string;
    name: string | null;
    description: string | null;
    registrationMode: 'SELF' | 'MANAGER_ASSIGN' | 'MIXED';
    isRanked: boolean;
    maxParticipants: number;
    sessionConfig: Record<string, unknown>;
    startAt: Date | null;
    endAt: Date | null;
  }) {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.clubMatchSessions)
        .values({ ...input, status: 'OPEN', pairingMode: 'FREE' })
        .returning();
      const displayName = input.name?.trim() || 'Buổi giao lưu CLB';
      await tx.insert(schema.communityPosts).values({
        communityId: created.communityId,
        authorId: created.createdBy,
        clubMatchSessionId: created.id,
        type: 'CLUB_SESSION_ANNOUNCEMENT',
        body: `🏸 ${displayName} đã mở đăng ký.`,
        mediaUrls: [],
        status: 'PUBLISHED',
        idempotencyKey: `club-match-session:${created.id}:created`,
      });
      await this.auditService.logCreate(
        tx,
        input.createdBy,
        'club_match_sessions',
        created.id,
        {
          communityId: created.communityId,
          categoryId: created.categoryId,
          status: created.status,
          registrationMode: created.registrationMode,
          pairingMode: created.pairingMode,
          isRanked: created.isRanked,
          maxParticipants: created.maxParticipants,
        },
      );
      return created;
    });
  }

  async listSessions(input: {
    communityId: string;
    status?: string;
    cursor?: string;
    limit: number;
  }) {
    const cursor = decodeCursor(input.cursor);
    const conditions = [
      eq(schema.clubMatchSessions.communityId, input.communityId),
      isNull(schema.clubMatchSessions.deletedAt),
    ];
    if (input.status) {
      conditions.push(eq(schema.clubMatchSessions.status, input.status));
    }
    if (input.cursor) {
      if (!cursor) return { invalidCursor: true as const };
      conditions.push(
        or(
          lt(schema.clubMatchSessions.createdAt, cursor.createdAt),
          and(
            eq(schema.clubMatchSessions.createdAt, cursor.createdAt),
            lt(schema.clubMatchSessions.id, cursor.id),
          ),
        )!,
      );
    }
    const rows = await this.db
      .select({
        session: schema.clubMatchSessions,
        communityName: schema.communities.name,
        participantCount: sql<number>`(
          select count(*)::int from club_match_session_participants p
          where p.session_id = ${schema.clubMatchSessions.id} and p.status = 'ACTIVE'
        )`,
        matchCount: sql<number>`(
          select count(*)::int from club_match_session_matches m
          where m.session_id = ${schema.clubMatchSessions.id} and m.deleted_at is null
        )`,
      })
      .from(schema.clubMatchSessions)
      .innerJoin(
        schema.communities,
        eq(schema.communities.id, schema.clubMatchSessions.communityId),
      )
      .where(and(...conditions))
      .orderBy(
        desc(schema.clubMatchSessions.createdAt),
        desc(schema.clubMatchSessions.id),
      )
      .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const last = items.at(-1)?.session;
    return {
      invalidCursor: false as const,
      items,
      meta: {
        hasMore,
        nextCursor:
          hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      },
    };
  }

  async listParticipants(
    sessionId: string,
    input: { status?: string; cursor?: string; limit: number },
  ) {
    const cursor = decodeCursor(input.cursor);
    const conditions = [
      eq(schema.clubMatchSessionParticipants.sessionId, sessionId),
    ];
    if (input.status) {
      conditions.push(
        eq(schema.clubMatchSessionParticipants.status, input.status),
      );
    }
    if (input.cursor) {
      if (!cursor) return { invalidCursor: true as const };
      conditions.push(
        or(
          lt(schema.clubMatchSessionParticipants.createdAt, cursor.createdAt),
          and(
            eq(schema.clubMatchSessionParticipants.createdAt, cursor.createdAt),
            lt(schema.clubMatchSessionParticipants.id, cursor.id),
          ),
        )!,
      );
    }
    const rows = await this.db
      .select({
        participant: schema.clubMatchSessionParticipants,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        isMock: schema.users.isMock,
      })
      .from(schema.clubMatchSessionParticipants)
      .leftJoin(
        schema.users,
        eq(schema.users.id, schema.clubMatchSessionParticipants.userId),
      )
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.userId, schema.clubMatchSessionParticipants.userId),
      )
      .where(and(...conditions))
      .orderBy(
        desc(schema.clubMatchSessionParticipants.createdAt),
        desc(schema.clubMatchSessionParticipants.id),
      )
      .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const last = items.at(-1)?.participant;
    return {
      invalidCursor: false as const,
      items,
      meta: {
        hasMore,
        nextCursor:
          hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      },
    };
  }

  async findParticipant(
    sessionId: string,
    userId: string,
    tx: AppDbOrTx = this.db,
  ) {
    const [row] = await tx
      .select()
      .from(schema.clubMatchSessionParticipants)
      .where(
        and(
          eq(schema.clubMatchSessionParticipants.sessionId, sessionId),
          eq(schema.clubMatchSessionParticipants.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findPreference(
    sessionId: string,
    userId: string,
    tx: AppDbOrTx = this.db,
  ) {
    const [row] = await tx
      .select()
      .from(schema.clubMatchPreferences)
      .where(
        and(
          eq(schema.clubMatchPreferences.sessionId, sessionId),
          eq(schema.clubMatchPreferences.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findMatch(id: string, tx: AppDbOrTx = this.db) {
    const [row] = await tx
      .select()
      .from(schema.clubMatchSessionMatches)
      .where(
        and(
          eq(schema.clubMatchSessionMatches.id, id),
          isNull(schema.clubMatchSessionMatches.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findStandaloneMatch(id: string, tx: AppDbOrTx = this.db) {
    const [row] = await tx
      .select()
      .from(schema.clubStandaloneMatches)
      .where(
        and(
          eq(schema.clubStandaloneMatches.id, id),
          isNull(schema.clubStandaloneMatches.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findStandaloneMatchIncludingDeleted(id: string) {
    const [row] = await this.db
      .select()
      .from(schema.clubStandaloneMatches)
      .where(eq(schema.clubStandaloneMatches.id, id))
      .limit(1);
    return row ?? null;
  }

  async projectMatch(id: string) {
    const match = await this.findMatch(id);
    if (!match) return null;
    const session = await this.findSession(match.sessionId);
    if (!session) return null;
    const userIds = [...match.sideAUserIds, ...match.sideBUserIds];
    const users = userIds.length
      ? await this.db
          .select({
            id: schema.users.id,
            isMock: schema.users.isMock,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
          })
          .from(schema.users)
          .leftJoin(
            schema.profiles,
            eq(schema.profiles.userId, schema.users.id),
          )
          .where(inArray(schema.users.id, userIds))
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    const projectMembers = (userIdsForSide: string[]) =>
      userIdsForSide.map((userId) => {
        const user = byId.get(userId);
        return {
          userId,
          id: userId,
          fullName: user?.fullName ?? null,
          avatarUrl: user?.avatarUrl ?? null,
          isMock: user?.isMock === true,
        };
      });
    const sideAMembers = projectMembers(match.sideAUserIds);
    const sideBMembers = projectMembers(match.sideBUserIds);
    const sideAName =
      sideAMembers.map((member) => member.fullName).filter(Boolean).join(' · ') ||
      'Đội A';
    const sideBName =
      sideBMembers.map((member) => member.fullName).filter(Boolean).join(' · ') ||
      'Đội B';
    const sportRules = {
      ...selectScoringPreset(
        { [session.categorySlug ?? '']: match.scoreConfig },
        session.categorySlug,
      ),
      mode: 'LITE' as const,
      kind: session.categorySlug,
    };
    const tournamentConfig = {
      isLite: true,
      mode: 'LITE' as const,
      hideAdvancedSettings: true,
      scoringMode: 'FREE',
    };
    const winnerId =
      match.winnerSide === 'A'
        ? 'SIDE_A'
        : match.winnerSide === 'B'
          ? 'SIDE_B'
          : null;
    return {
      ...match,
      contextType: 'CLUB_SOCIAL_MATCH_SESSION' as const,
      isStandaloneMatch: false,
      clubMatchSessionId: match.sessionId,
      tournamentId: null,
      groupId: null,
      stageId: null,
      stageType: 'SOCIAL_SESSION',
      roundNumber: 1,
      matchOrder: 1,
      bracketBranch: 'SOCIAL_SESSION',
      isBye: false,
      team1Id: 'SIDE_A',
      team2Id: 'SIDE_B',
      participant1Id: 'SIDE_A',
      participant2Id: 'SIDE_B',
      team1Name: sideAName,
      team2Name: sideBName,
      sport: session.categorySlug,
      sportRules,
      effectiveSportRules: sportRules,
      tournamentConfig,
      scheduledAt: match.scheduledAt?.toISOString() ?? null,
      winnerId,
      loserId:
        winnerId === 'SIDE_A'
          ? 'SIDE_B'
          : winnerId === 'SIDE_B'
            ? 'SIDE_A'
            : null,
      team1Members: sideAMembers,
      team2Members: sideBMembers,
      team1MemberInfos: sideAMembers,
      team2MemberInfos: sideBMembers,
      tournament: {
        name: session.session.name || 'Buổi giao lưu CLB',
        createdBy: session.session.createdBy,
        communityId: session.session.communityId,
        categoryName: session.categoryName,
        categorySlug: session.categorySlug,
        categoryConfig: session.categoryConfig,
        sportRules,
        tournamentConfig,
        isRanked: session.session.isRanked,
      },
      session: {
        id: session.session.id,
        resolvedName: session.session.name,
        communityId: session.session.communityId,
        categoryId: session.session.categoryId,
        categoryName: session.categoryName,
        categorySlug: session.categorySlug,
        categoryConfig: session.categoryConfig,
        isRanked: session.session.isRanked,
      },
      participant1: {
        id: 'SIDE_A',
        teamName: sideAName,
        members: sideAMembers,
      },
      participant2: {
        id: 'SIDE_B',
        teamName: sideBName,
        members: sideBMembers,
      },
    };
  }

  async projectStandaloneMatch(id: string) {
    const match = await this.findStandaloneMatch(id);
    if (!match) return null;
    const [context] = await this.db
      .select({
        communityName: schema.communities.name,
        categoryName: schema.categories.name,
        categorySlug: schema.categories.slug,
        categoryConfig: schema.categories.categoryConfig,
      })
      .from(schema.clubStandaloneMatches)
      .innerJoin(
        schema.communities,
        eq(schema.communities.id, schema.clubStandaloneMatches.communityId),
      )
      .innerJoin(
        schema.categories,
        eq(schema.categories.id, schema.clubStandaloneMatches.categoryId),
      )
      .where(eq(schema.clubStandaloneMatches.id, id))
      .limit(1);
    if (!context) return null;

    const userIds = [...match.sideAUserIds, ...match.sideBUserIds];
    const users = userIds.length
      ? await this.db
          .select({
            id: schema.users.id,
            isMock: schema.users.isMock,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
          })
          .from(schema.users)
          .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.users.id))
          .where(inArray(schema.users.id, userIds))
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    const projectMembers = (ids: string[]) =>
      ids.map((userId) => {
        const user = byId.get(userId);
        return {
          userId,
          id: userId,
          fullName: user?.fullName ?? null,
          avatarUrl: user?.avatarUrl ?? null,
          isMock: user?.isMock === true,
        };
      });
    const sideAMembers = projectMembers(match.sideAUserIds);
    const sideBMembers = projectMembers(match.sideBUserIds);
    const sideAName =
      sideAMembers.map((member) => member.fullName).filter(Boolean).join(' · ') ||
      'Đội A';
    const sideBName =
      sideBMembers.map((member) => member.fullName).filter(Boolean).join(' · ') ||
      'Đội B';
    const rawCategoryConfig = context.categoryConfig;
    const configuredRules =
      rawCategoryConfig && typeof rawCategoryConfig === 'object'
        ? (rawCategoryConfig as Record<string, unknown>).defaultSportRules
        : null;
    const sportRules: Record<string, unknown> = {
      ...(configuredRules && typeof configuredRules === 'object'
        ? (configuredRules as Record<string, unknown>)
        : {}),
      ...selectScoringPreset(
        { [context.categorySlug ?? '']: match.scoreConfig },
        context.categorySlug,
      ),
      mode: 'LITE',
      kind: context.categorySlug,
      scoringMode: 'FREE',
      maxSets: 10,
    };
    const tournamentConfig = {
      isLite: true,
      mode: 'LITE',
      scoringMode: 'FREE',
      maxSets: 10,
      hideAdvancedSettings: true,
    };
    const winnerId =
      match.winnerSide === 'A'
        ? 'SIDE_A'
        : match.winnerSide === 'B'
          ? 'SIDE_B'
          : null;
    return {
      ...match,
      contextType: 'CLUB_STANDALONE_MATCH' as const,
      standaloneMatchId: match.id,
      clubMatchSessionId: null,
      tournamentId: null,
      groupId: null,
      stageId: null,
      stageType: 'CLUB_STANDALONE',
      roundNumber: 1,
      matchOrder: 1,
      bracketBranch: 'CLUB_STANDALONE',
      isBye: false,
      team1Id: 'SIDE_A',
      team2Id: 'SIDE_B',
      participant1Id: 'SIDE_A',
      participant2Id: 'SIDE_B',
      team1Name: sideAName,
      team2Name: sideBName,
      sport: context.categorySlug,
      sportKey: context.categorySlug,
      sportRules,
      effectiveSportRules: sportRules,
      tournamentConfig,
      scheduledAt: match.scheduledAt?.toISOString() ?? null,
      winnerId,
      loserId:
        winnerId === 'SIDE_A'
          ? 'SIDE_B'
          : winnerId === 'SIDE_B'
            ? 'SIDE_A'
            : null,
      team1Members: sideAMembers,
      team2Members: sideBMembers,
      team1MemberInfos: sideAMembers,
      team2MemberInfos: sideBMembers,
      tournament: null,
      session: null,
      community: {
        id: match.communityId,
        name: context.communityName,
        categoryId: match.categoryId,
        categoryName: context.categoryName,
        categorySlug: context.categorySlug,
        categoryConfig: context.categoryConfig,
      },
      participant1: { id: 'SIDE_A', teamName: sideAName, members: sideAMembers },
      participant2: { id: 'SIDE_B', teamName: sideBName, members: sideBMembers },
    };
  }

  async listMatches(
    sessionId: string,
    input: { status?: string; cursor?: string; limit: number },
  ) {
    const cursor = decodeCursor(input.cursor);
    const conditions = [
      eq(schema.clubMatchSessionMatches.sessionId, sessionId),
      isNull(schema.clubMatchSessionMatches.deletedAt),
    ];
    if (input.status) {
      conditions.push(eq(schema.clubMatchSessionMatches.status, input.status));
    }
    if (input.cursor) {
      if (!cursor) return { invalidCursor: true as const };
      conditions.push(
        or(
          lt(schema.clubMatchSessionMatches.createdAt, cursor.createdAt),
          and(
            eq(schema.clubMatchSessionMatches.createdAt, cursor.createdAt),
            lt(schema.clubMatchSessionMatches.id, cursor.id),
          ),
        )!,
      );
    }
    const rows = await this.db
      .select({ id: schema.clubMatchSessionMatches.id })
      .from(schema.clubMatchSessionMatches)
      .where(and(...conditions))
      .orderBy(
        desc(schema.clubMatchSessionMatches.createdAt),
        desc(schema.clubMatchSessionMatches.id),
      )
      .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const selected = hasMore ? rows.slice(0, input.limit) : rows;
    const items = (
      await Promise.all(selected.map((row) => this.projectMatch(row.id)))
    ).filter(Boolean);
    const lastMatch = selected.at(-1)
      ? await this.findMatch(selected.at(-1)!.id)
      : null;
    return {
      invalidCursor: false as const,
      items,
      meta: {
        hasMore,
        nextCursor:
          hasMore && lastMatch
            ? encodeCursor(lastMatch.createdAt, lastMatch.id)
            : null,
      },
    };
  }

  async listStandaloneMatches(
    communityId: string,
    input: { status?: string; cursor?: string; limit: number },
  ) {
    const cursor = decodeCursor(input.cursor);
    const conditions = [
      eq(schema.clubStandaloneMatches.communityId, communityId),
      isNull(schema.clubStandaloneMatches.deletedAt),
    ];
    if (input.status) {
      conditions.push(eq(schema.clubStandaloneMatches.status, input.status));
    }
    if (input.cursor) {
      if (!cursor) return { invalidCursor: true as const };
      conditions.push(
        or(
          lt(schema.clubStandaloneMatches.createdAt, cursor.createdAt),
          and(
            eq(schema.clubStandaloneMatches.createdAt, cursor.createdAt),
            lt(schema.clubStandaloneMatches.id, cursor.id),
          ),
        )!,
      );
    }
    const rows = await this.db
      .select({ id: schema.clubStandaloneMatches.id })
      .from(schema.clubStandaloneMatches)
      .where(and(...conditions))
      .orderBy(
        desc(schema.clubStandaloneMatches.createdAt),
        desc(schema.clubStandaloneMatches.id),
      )
      .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const selected = hasMore ? rows.slice(0, input.limit) : rows;
    const items = (
      await Promise.all(selected.map((row) => this.projectStandaloneMatch(row.id)))
    ).filter(Boolean);
    const [last] = selected.slice(-1);
    const lastMatch = last ? await this.findStandaloneMatch(last.id) : null;
    return {
      invalidCursor: false as const,
      items,
      meta: {
        hasMore,
        nextCursor:
          hasMore && lastMatch
            ? encodeCursor(lastMatch.createdAt, lastMatch.id)
            : null,
      },
    };
  }

  async saveCommand(
    tx: AppTx,
    input: {
      sessionId: string;
      actorId: string;
      operation: string;
      idempotencyKey: string;
      request: unknown;
      result: Record<string, unknown>;
    },
  ) {
    return tx.insert(schema.clubMatchSessionCommands).values({
      sessionId: input.sessionId,
      actorId: input.actorId,
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint(input.request),
      result: input.result,
    });
  }

  async findCommand(
    tx: AppTx,
    input: {
      actorId: string;
      operation: string;
      idempotencyKey: string;
      request: unknown;
    },
  ) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${input.actorId}:${input.operation}:${input.idempotencyKey}`}))`,
    );
    const [row] = await tx
      .select()
      .from(schema.clubMatchSessionCommands)
      .where(
        and(
          eq(schema.clubMatchSessionCommands.actorId, input.actorId),
          eq(schema.clubMatchSessionCommands.operation, input.operation),
          eq(
            schema.clubMatchSessionCommands.idempotencyKey,
            input.idempotencyKey,
          ),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      sameRequest: row.requestFingerprint === fingerprint(input.request),
      result: row.result,
    };
  }

  async getPairingWarnings(
    tx: AppTx,
    sessionId: string,
    sideAUserIds: string[],
    sideBUserIds: string[],
  ): Promise<ClubMatchWarning[]> {
    const allIds = [...sideAUserIds, ...sideBUserIds];
    const warnings: ClubMatchWarning[] = [];
    const active = await tx
      .select({
        sideAUserIds: schema.clubMatchSessionMatches.sideAUserIds,
        sideBUserIds: schema.clubMatchSessionMatches.sideBUserIds,
      })
      .from(schema.clubMatchSessionMatches)
      .where(
        and(
          eq(schema.clubMatchSessionMatches.sessionId, sessionId),
          inArray(schema.clubMatchSessionMatches.status, [
            'SCHEDULED',
            'ONGOING',
          ]),
          isNull(schema.clubMatchSessionMatches.deletedAt),
        ),
      );
    const activeUsers = normalizeIds(
      active.flatMap((match) => [...match.sideAUserIds, ...match.sideBUserIds]),
    ).filter((id) => allIds.includes(id));
    if (activeUsers.length > 0) {
      warnings.push({ code: 'PLAYER_ALREADY_ACTIVE', userIds: activeUsers });
    }

    const completed = await tx
      .select({
        sideAUserIds: schema.clubMatchSessionMatches.sideAUserIds,
        sideBUserIds: schema.clubMatchSessionMatches.sideBUserIds,
      })
      .from(schema.clubMatchSessionMatches)
      .where(
        and(
          eq(schema.clubMatchSessionMatches.sessionId, sessionId),
          eq(schema.clubMatchSessionMatches.status, 'COMPLETED'),
          isNull(schema.clubMatchSessionMatches.deletedAt),
        ),
      );
    const samePair = completed.some(
      (match) =>
        (JSON.stringify(normalizeIds(match.sideAUserIds)) ===
          JSON.stringify(normalizeIds(sideAUserIds)) &&
          JSON.stringify(normalizeIds(match.sideBUserIds)) ===
            JSON.stringify(normalizeIds(sideBUserIds))) ||
        (JSON.stringify(normalizeIds(match.sideAUserIds)) ===
          JSON.stringify(normalizeIds(sideBUserIds)) &&
          JSON.stringify(normalizeIds(match.sideBUserIds)) ===
            JSON.stringify(normalizeIds(sideAUserIds))),
    );
    if (samePair) {
      warnings.push({
        code: 'REPEATED_PAIRING',
        userIds: normalizeIds(allIds),
      });
    }

    const preferences = await tx
      .select()
      .from(schema.clubMatchPreferences)
      .where(
        and(
          eq(schema.clubMatchPreferences.sessionId, sessionId),
          inArray(schema.clubMatchPreferences.userId, allIds),
        ),
      );
    for (const preference of preferences) {
      const ownSide = sideAUserIds.includes(preference.userId)
        ? sideAUserIds
        : sideBUserIds;
      const oppositeSide =
        ownSide === sideAUserIds ? sideBUserIds : sideAUserIds;
      const avoided = preference.avoidUserIds.filter((id) =>
        allIds.includes(id),
      );
      if (avoided.length > 0) {
        warnings.push({
          code: 'AVOIDED_PLAYER',
          userIds: normalizeIds([preference.userId, ...avoided]),
        });
      }
      if (
        preference.preferredPartnerUserIds.length > 0 &&
        !preference.preferredPartnerUserIds.some((id) => ownSide.includes(id))
      ) {
        warnings.push({
          code: 'PARTNER_PREFERENCE_NOT_MATCHED',
          userIds: [preference.userId],
        });
      }
      if (
        preference.preferredOpponentUserIds.length > 0 &&
        !preference.preferredOpponentUserIds.some((id) =>
          oppositeSide.includes(id),
        )
      ) {
        warnings.push({
          code: 'OPPONENT_PREFERENCE_NOT_MATCHED',
          userIds: [preference.userId],
        });
      }
    }
    return warnings;
  }

  async auditUpdate(
    tx: AppTx,
    actorId: string,
    tableName: string,
    recordId: string,
    oldValues: Record<string, unknown>,
    newValues: Record<string, unknown>,
  ) {
    await this.auditService.logUpdate(
      tx,
      actorId,
      tableName,
      recordId,
      oldValues,
      newValues,
    );
  }

  parseCursor(cursor?: string) {
    return decodeCursor(cursor);
  }

  hashRequest(value: unknown) {
    return fingerprint(value);
  }
}
