import { Inject, Injectable } from '@nestjs/common';
import { aliasedTable, and, asc, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { AppDb, AppDbOrTx } from '../../database/db.types';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { CursorPaginationHelper } from '../../common/helpers/cursor-pagination.helper';
import type { CreateCommunityPostDto } from './dto/create-community-post.dto';

@Injectable()
export class CommunitySocialRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  async getSettings(communityId: string) {
    const [settings] = await this.db
      .select()
      .from(schema.communitySocialSettings)
      .where(eq(schema.communitySocialSettings.communityId, communityId))
      .limit(1);
    return settings ?? {
      communityId,
      postingPolicy: 'MEMBERS',
      postApprovalRequired: false,
      commentsEnabled: true,
      chatEnabled: true,
      publicFeed: true,
      memberTaggingPolicy: 'MEMBERS',
      memberMatchCreationEnabled: true,
      memberMatchScoringEnabled: true,
      memberMatchDeletionEnabled: false,
      matchScoringPresets: {},
    };
  }

  async createPost(
    communityId: string,
    authorId: string,
    dto: CreateCommunityPostDto,
    status: 'PUBLISHED' | 'PENDING',
    idempotencyKey?: string,
  ) {
    const values = {
      communityId,
      authorId,
      body: dto.body?.trim() || null,
      mediaUrls: (dto.mediaUrls ?? []).map((url) => url.trim()),
      topics: (dto.topics ?? []).map((topic) => topic.trim().replace(/^#/, '')),
      mentions: dto.mentions ?? [],
      status,
      idempotencyKey: idempotencyKey?.trim() || null,
    };
    const [created] = await this.db
      .insert(schema.communityPosts)
      .values(values)
      .onConflictDoNothing()
      .returning();
    
    const postRecord = created || (values.idempotencyKey ? (await this.db
      .select()
      .from(schema.communityPosts)
      .where(and(
        eq(schema.communityPosts.communityId, communityId),
        eq(schema.communityPosts.authorId, authorId),
        eq(schema.communityPosts.idempotencyKey, values.idempotencyKey),
      ))
      .limit(1))[0] : null);

    if (!postRecord) return null;

    // Lấy thông tin tác giả từ profiles để trả về đầy đủ cho frontend
    const [authorProfile] = await this.db
      .select({
        id: schema.users.id,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.users)
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.users.id, authorId))
      .limit(1);

    return {
      ...postRecord,
      author: authorProfile?.id ? authorProfile : { id: authorId, fullName: 'Thành viên CLB', avatarUrl: null },
    };
  }

  async listPosts(communityId: string, limit: number, cursor?: string, viewerId?: string, search?: string) {
    const conditions: SQL[] = [
      eq(schema.communityPosts.communityId, communityId),
      viewerId
        ? or(
            eq(schema.communityPosts.status, 'PUBLISHED'),
            and(
              eq(schema.communityPosts.status, 'PENDING'),
              eq(schema.communityPosts.authorId, viewerId),
            ),
          ) as SQL
        : eq(schema.communityPosts.status, 'PUBLISHED'),
      isNull(schema.communityPosts.deletedAt),
    ];
    if (search?.trim()) {
      const pattern = `%${search.trim()}%`;
      conditions.push(or(
        ilike(schema.communityPosts.body, pattern),
        sql`EXISTS (
          SELECT 1 FROM ${schema.profiles}
          WHERE ${schema.profiles.userId} = ${schema.communityPosts.authorId}
            AND ${schema.profiles.fullName} ILIKE ${pattern}
        )`,
      ) as SQL);
    }
    const decoded = cursor
      ? CursorPaginationHelper.decodeCursor<{ id: string; createdAt: string }>(cursor)
      : null;
    if (decoded?.createdAt && decoded.id) {
      conditions.push(or(
        lt(schema.communityPosts.createdAt, new Date(decoded.createdAt)),
        and(
          eq(schema.communityPosts.createdAt, new Date(decoded.createdAt)),
          lt(schema.communityPosts.id, decoded.id),
        ),
      ) as SQL);
    }
    const rows = await this.db
      .select({
        post: schema.communityPosts,
        author: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
        tournament: {
          id: schema.tournaments.id,
          name: schema.tournaments.name,
          sport: schema.categories.slug,
          categoryName: schema.categories.name,
          matchType: schema.tournaments.matchType,
          startDate: schema.tournaments.startDate,
          endDate: schema.tournaments.endDate,
          status: schema.tournaments.status,
          bannerUrl: schema.tournaments.bannerUrl,
          maxParticipants: schema.tournaments.maxParticipants,
          inviteCode: schema.tournaments.inviteCode,
          // Keep the Lite/advanced boundary explicit for mobile clients. The
          // community feed intentionally selects a compact tournament shape,
          // so clients cannot infer Lite from the omitted tournamentConfig.
          isTournamentLite: sql<boolean>`COALESCE((${schema.tournaments.tournamentConfig}->>'isLite')::boolean, false) = true OR ${schema.tournaments.tournamentConfig}->>'mode' = 'LITE'`,
          hasBracket: sql<boolean>`EXISTS (
            SELECT 1
            FROM ${schema.tournamentStages}
            WHERE ${schema.tournamentStages.tournamentId} = ${schema.tournaments.id}
              AND ${schema.tournamentStages.deletedAt} IS NULL
          ) OR EXISTS (
            SELECT 1
            FROM ${schema.matches}
            WHERE ${schema.matches.tournamentId} = ${schema.tournaments.id}
              AND ${schema.matches.deletedAt} IS NULL
          )`,
        },
        viewerReaction: viewerId
          ? sql<string | null>`(
              SELECT ${schema.communityPostReactions.reactionType}
              FROM ${schema.communityPostReactions}
              WHERE ${schema.communityPostReactions.postId} = ${schema.communityPosts.id}
                AND ${schema.communityPostReactions.userId} = ${viewerId}
              LIMIT 1
            )`
          : sql<string | null>`NULL`,
      })
      .from(schema.communityPosts)
      .leftJoin(schema.users, eq(schema.communityPosts.authorId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.communityPosts.authorId, schema.profiles.userId))
      .leftJoin(schema.tournaments, eq(schema.communityPosts.tournamentId, schema.tournaments.id))
      .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
      .where(and(...conditions))
      .orderBy(desc(schema.communityPosts.createdAt), desc(schema.communityPosts.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const initialData = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
      ...row.post,
      author: row.author?.id ? row.author : null,
      tournament: row.tournament?.id ? row.tournament : null,
      viewerReaction: row.viewerReaction,
    }));

    // Deduplicate duplicate tournament posts (e.g. older legacy announcement + bracket posts for same tournament)
    const seenTournaments = new Set<string>();
    const duplicatePostIdsToCleanup: string[] = [];
    const deduplicatedInitialData: typeof initialData = [];

    for (const p of initialData) {
      if (p.tournamentId) {
        if (seenTournaments.has(p.tournamentId)) {
          duplicatePostIdsToCleanup.push(p.id);
          continue;
        }
        seenTournaments.add(p.tournamentId);
      }
      deduplicatedInitialData.push(p);
    }

    // Clean up duplicate legacy tournament posts in the background
    if (duplicatePostIdsToCleanup.length > 0) {
      this.db
        .update(schema.communityPosts)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(inArray(schema.communityPosts.id, duplicatePostIdsToCleanup))
        .catch((err) => console.error('Failed to cleanup duplicate tournament posts:', err));
    }

    // Attach poll data if post has a poll
    const postIds = deduplicatedInitialData.map((p) => p.id);
    const polls = postIds.length > 0
      ? await this.db
          .select({ id: schema.communityPolls.id, postId: schema.communityPolls.postId })
          .from(schema.communityPolls)
          .where(inArray(schema.communityPolls.postId, postIds))
      : [];

    const pollDetailsMap = new Map<string, any>();
    for (const p of polls) {
      if (p.postId) {
        const details = await this.getPollDetails(p.id, viewerId);
        if (details) pollDetailsMap.set(p.postId, details);
      }
    }

    const data = deduplicatedInitialData.map((p) => ({
      ...p,
      poll: pollDetailsMap.get(p.id) || null,
    }));

    const last = data[data.length - 1];
    return {
      data,
      meta: {
        limit,
        hasMore,
        nextCursor: hasMore && last
          ? CursorPaginationHelper.encodeCursor({ id: last.id, createdAt: last.createdAt })
          : null,
      },
    };
  }

  /**
   * Product activity projection over the existing social graph. This is not a
   * second event store: the linked session/tournament remains authoritative and
   * community_posts only provides publication/order/idempotency.
   */
  async listActivityFeed(input: {
    limit: number;
    cursor?: string;
    date?: string;
    type?: 'CLUB_RECRUITING' | 'TOURNAMENT_OPENED';
    viewerId?: string;
  }) {
    const decoded = input.cursor
      ? CursorPaginationHelper.decodeCursor<{ id: string; createdAt: string }>(input.cursor)
      : null;
    if (input.cursor && (!decoded?.id || !decoded.createdAt || Number.isNaN(new Date(decoded.createdAt).getTime()))) {
      return { invalidCursor: true as const };
    }

    const post = schema.communityPosts;
    const session = schema.clubMatchSessions;
    const tournament = schema.tournaments;
    const sessionVenues = aliasedTable(schema.tournamentVenues, 'session_venues');
    const eventAt = sql`COALESCE(${session.startAt}, ${tournament.registrationStartDate}, ${post.createdAt})`;
    const targetIsCurrent = sql`
      NOT EXISTS (
        SELECT 1
        FROM community_posts newer
        WHERE newer.deleted_at IS NULL
          AND newer.status = 'PUBLISHED'
          AND newer.community_id = ${post.communityId}
          AND (
            (${post.clubMatchSessionId} IS NOT NULL AND newer.club_match_session_id = ${post.clubMatchSessionId})
            OR (${post.tournamentId} IS NOT NULL AND newer.tournament_id = ${post.tournamentId})
            OR (
              ${session.pairingMode} = 'BRACKET'
              AND newer.tournament_id = ${session.bracketTournamentId}
            )
          )
          AND (
            newer.created_at > ${post.createdAt}
            OR (newer.created_at = ${post.createdAt} AND newer.id > ${post.id})
          )
      )`;
    const activityIsVisible = input.viewerId
      ? sql`(
          (${schema.communities.visibility} = 'PUBLIC' AND
            COALESCE(${schema.communitySocialSettings.publicFeed}, true) = true)
          OR EXISTS (
            SELECT 1 FROM community_members cm
            WHERE cm.community_id = ${post.communityId}
              AND cm.user_id = ${input.viewerId}
              AND cm.status = 'JOINED'
          )
        )`
      : sql`(${schema.communities.visibility} = 'PUBLIC' AND COALESCE(${schema.communitySocialSettings.publicFeed}, true) = true)`;

    const conditions: SQL[] = [
      eq(post.status, 'PUBLISHED'),
      isNull(post.deletedAt),
      eq(schema.communities.status, 'ACTIVE'),
      activityIsVisible,
      or(isNotNull(post.clubMatchSessionId), isNotNull(post.tournamentId)) as SQL,
      sql`(
        (
          ${post.clubMatchSessionId} IS NOT NULL
          AND ${session.id} IS NOT NULL
          AND ${session.status} NOT IN ('ENDED', 'CANCELLED')
          AND (
            ${session.pairingMode} <> 'BRACKET'
            OR (
              ${tournament.id} IS NOT NULL
              AND ${tournament.status} NOT IN ('COMPLETED', 'FINISHED', 'DONE', 'ENDED', 'CANCELLED', 'PENDING_DELETE')
            )
          )
        )
        OR (
          ${post.tournamentId} IS NOT NULL
          AND ${tournament.id} IS NOT NULL
          AND ${tournament.status} NOT IN ('COMPLETED', 'FINISHED', 'DONE', 'ENDED', 'CANCELLED', 'PENDING_DELETE')
        )
      )`,
      targetIsCurrent,
    ];
    if (input.type === 'CLUB_RECRUITING') {
      conditions.push(sql`${post.clubMatchSessionId} IS NOT NULL AND ${session.pairingMode} = 'FREE'`);
    }
    if (input.type === 'TOURNAMENT_OPENED') {
      conditions.push(sql`${post.tournamentId} IS NOT NULL`);
    }
    if (input.date) {
      conditions.push(sql`(${eventAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ${input.date}`);
    }
    if (decoded) {
      conditions.push(
        or(
          lt(post.createdAt, new Date(decoded.createdAt)),
          and(eq(post.createdAt, new Date(decoded.createdAt)), lt(post.id, decoded.id)),
        ) as SQL,
      );
    }

    const rows = await this.db
      .select({
        post,
        community: {
          id: schema.communities.id,
          name: schema.communities.name,
          logoUrl: schema.communities.logoUrl,
        },
        session: {
          id: session.id,
          name: session.name,
          description: session.description,
          pairingMode: session.pairingMode,
          maxParticipants: session.maxParticipants,
          feePerSlot: session.feePerSlot,
          startAt: session.startAt,
          endAt: session.endAt,
          sessionConfig: session.sessionConfig,
        },
        tournament: {
          id: tournament.id,
          name: tournament.name,
          description: tournament.description,
          status: tournament.status,
          bannerUrl: tournament.bannerUrl,
          maxParticipants: tournament.maxParticipants,
          reservedSlotsCount: tournament.reservedSlotsCount,
          registrationStartDate: tournament.registrationStartDate,
          startDate: tournament.startDate,
        },
        category: {
          name: schema.categories.name,
          slug: schema.categories.slug,
        },
        venueName: sql<string | null>`COALESCE(${sessionVenues.name}, ${schema.tournamentVenues.name})`,
        venueAddress: sql<string | null>`COALESCE(${sessionVenues.locationAddress}, ${schema.tournamentVenues.locationAddress}, ${schema.communities.locationAddress})`,
        courtName: schema.venueCourts.courtName,
        participantCount: sql<number>`CASE
          WHEN ${session.id} IS NOT NULL AND ${session.pairingMode} = 'FREE' THEN (
            SELECT count(*)::int FROM club_match_session_participants p
            WHERE p.session_id = ${session.id} AND p.status = 'ACTIVE'
          )
          WHEN ${tournament.id} IS NOT NULL THEN (
            SELECT count(*)::int FROM tournament_participants p
            WHERE p.tournament_id = ${tournament.id}
              AND p.team_status NOT IN ('REJECTED', 'WITHDRAWN', 'KICKED', 'EXPIRED', 'CANCELLED')
          )
          ELSE 0
        END`,
        cardType: sql<'CLUB_RECRUITING' | 'TOURNAMENT_OPENED'>`CASE
          WHEN ${tournament.id} IS NOT NULL AND (${post.tournamentId} IS NOT NULL OR ${session.pairingMode} = 'BRACKET') THEN 'TOURNAMENT_OPENED'
          ELSE 'CLUB_RECRUITING'
        END`,
      })
      .from(post)
      .innerJoin(schema.communities, eq(schema.communities.id, post.communityId))
      .leftJoin(schema.communitySocialSettings, eq(schema.communitySocialSettings.communityId, post.communityId))
      .leftJoin(session, eq(session.id, post.clubMatchSessionId))
      .leftJoin(
        tournament,
        sql`${tournament.id} = COALESCE(${post.tournamentId}, ${session.bracketTournamentId})`,
      )
      .leftJoin(schema.categories, sql`${schema.categories.id} = COALESCE(${session.categoryId}, ${tournament.categoryId})`)
      .leftJoin(sessionVenues, eq(sessionVenues.id, session.venueId))
      .leftJoin(schema.tournamentVenues, eq(schema.tournamentVenues.id, tournament.venueId))
      .leftJoin(schema.venueCourts, eq(schema.venueCourts.id, session.courtId))
      .where(and(...conditions))
      .orderBy(desc(post.createdAt), desc(post.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const sessionIds = items
      .map((row) => row.session?.id)
      .filter((id): id is string => Boolean(id));
    const participants = sessionIds.length
      ? await this.db
          .select({
            sessionId: schema.clubMatchSessionParticipants.sessionId,
            userId: schema.clubMatchSessionParticipants.userId,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
            createdAt: schema.clubMatchSessionParticipants.createdAt,
          })
          .from(schema.clubMatchSessionParticipants)
          .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.clubMatchSessionParticipants.userId))
          .where(and(
            inArray(schema.clubMatchSessionParticipants.sessionId, sessionIds),
            eq(schema.clubMatchSessionParticipants.status, 'ACTIVE'),
          ))
          .orderBy(asc(schema.clubMatchSessionParticipants.createdAt))
      : [];
    const participantsBySession = new Map<string, typeof participants>();
    for (const participant of participants) {
      const current = participantsBySession.get(participant.sessionId) ?? [];
      if (current.length < 8) current.push(participant);
      participantsBySession.set(participant.sessionId, current);
    }

    const data = items.map((row) => {
      const sessionConfig = row.session?.sessionConfig;
      const locationFromConfig = sessionConfig && typeof sessionConfig === 'object'
        ? (sessionConfig as Record<string, unknown>).location
        : null;
      const locationDisplay = locationFromConfig && typeof locationFromConfig === 'object'
        ? (locationFromConfig as Record<string, unknown>).display
        : null;
      const title = row.session?.name || row.tournament?.name || row.post.body || 'Hoạt động CLB';
      const description = row.session?.description || row.tournament?.description || row.post.body || null;
      const eventDate = row.session?.startAt ?? row.tournament?.registrationStartDate ?? row.tournament?.startDate ?? row.post.createdAt;
      const max = row.cardType === 'TOURNAMENT_OPENED'
        ? (row.tournament?.maxParticipants ?? 0)
        : (row.session?.maxParticipants ?? 0);
      const current = Number(row.participantCount ?? 0);
      return {
        id: row.post.id,
        type: row.cardType,
        community: row.community,
        sport: row.category?.name ?? row.category?.slug ?? null,
        sportTier: null,
        title,
        description,
        playDate: eventDate?.toISOString() ?? null,
        startTime: eventDate?.toISOString() ?? null,
        endTime: row.session?.endAt?.toISOString() ?? null,
        location: row.venueAddress || locationDisplay || row.venueName || null,
        clubMatchSessionId: row.session?.id ?? null,
        tournamentId: row.tournament?.id ?? null,
        verified: false,
        slots: row.cardType === 'CLUB_RECRUITING' && row.session
          ? {
              current,
              max,
              feePerSlot: row.session.feePerSlot,
              joinedPlayers: (participantsBySession.get(row.session.id) ?? []).map((participant) => ({
                userId: participant.userId,
                name: participant.fullName ?? 'Thành viên CLB',
                avatarUrl: participant.avatarUrl,
              })),
            }
          : null,
        tournament: row.cardType === 'TOURNAMENT_OPENED' && row.tournament
          ? {
              id: row.tournament.id,
              remainingSlots: Math.max((row.tournament.maxParticipants ?? 0) - current - (row.tournament.reservedSlotsCount ?? 0), 0),
              totalSlots: row.tournament.maxParticipants ?? 0,
              bannerUrl: row.tournament.bannerUrl,
            }
          : null,
        venue: row.venueName || row.venueAddress || row.courtName
          ? { name: row.venueName, address: row.venueAddress, courtName: row.courtName }
          : null,
      };
    });
    const last = items.at(-1)?.post;
    return {
      invalidCursor: false as const,
      data,
      meta: {
        limit: input.limit,
        hasMore,
        nextCursor: hasMore && last
          ? CursorPaginationHelper.encodeCursor({ id: last.id, createdAt: last.createdAt })
          : null,
      },
    };
  }

  async findLinkedActivity(communityId: string, target: { clubMatchSessionId?: string; tournamentId?: string }) {
    if (target.clubMatchSessionId) {
      const [row] = await this.db
        .select({
          session: schema.clubMatchSessions,
          communityId: schema.clubMatchSessions.communityId,
        })
        .from(schema.clubMatchSessions)
        .where(and(
          eq(schema.clubMatchSessions.id, target.clubMatchSessionId),
          eq(schema.clubMatchSessions.communityId, communityId),
          isNull(schema.clubMatchSessions.deletedAt),
        ))
        .limit(1);
      return row?.session ? { kind: 'SESSION' as const, resource: row.session } : null;
    }
    if (target.tournamentId) {
      const [row] = await this.db
        .select()
        .from(schema.tournaments)
        .where(and(
          eq(schema.tournaments.id, target.tournamentId),
          eq(schema.tournaments.communityId, communityId),
          isNull(schema.tournaments.deletedAt),
        ))
        .limit(1);
      return row ? { kind: 'TOURNAMENT' as const, resource: row } : null;
    }
    return null;
  }

  async findLatestLinkedActivityPost(
    communityId: string,
    target: { clubMatchSessionId?: string; tournamentId?: string },
    tx: AppDbOrTx = this.db,
  ) {
    const targetCondition = target.clubMatchSessionId
      ? eq(schema.communityPosts.clubMatchSessionId, target.clubMatchSessionId)
      : eq(schema.communityPosts.tournamentId, target.tournamentId!);
    const [post] = await tx
      .select()
      .from(schema.communityPosts)
      .where(and(
        eq(schema.communityPosts.communityId, communityId),
        targetCondition,
        isNull(schema.communityPosts.deletedAt),
        sql`${schema.communityPosts.status} IN ('PUBLISHED', 'PENDING')`,
      ))
      .orderBy(desc(schema.communityPosts.createdAt), desc(schema.communityPosts.id))
      .limit(1);
    return post ?? null;
  }

  async createLinkedActivityPost(input: {
    communityId: string;
    authorId: string;
    clubMatchSessionId?: string;
    tournamentId?: string;
    body: string;
    status: 'PUBLISHED' | 'PENDING';
    idempotencyKey?: string;
  }) {
    return this.db.transaction(async (tx) => {
      const lockKey = `activity:${input.communityId}:${input.clubMatchSessionId ?? input.tournamentId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const existing = await this.findLatestLinkedActivityPost(input.communityId, input, tx);
      if (existing) return { post: existing, reused: true };
      const [post] = await tx
        .insert(schema.communityPosts)
        .values({
          communityId: input.communityId,
          authorId: input.authorId,
          ...(input.clubMatchSessionId ? { clubMatchSessionId: input.clubMatchSessionId } : {}),
          ...(input.tournamentId ? { tournamentId: input.tournamentId } : {}),
          type: input.clubMatchSessionId ? 'CLUB_SESSION_ANNOUNCEMENT' : 'TOURNAMENT_ANNOUNCEMENT',
          body: input.body,
          mediaUrls: [],
          status: input.status,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();
      return { post: post ?? null, reused: false };
    });
  }

  async updateSettings(communityId: string, values: Partial<typeof schema.communitySocialSettings.$inferInsert>) {
    const [settings] = await this.db
      .insert(schema.communitySocialSettings)
      .values({ communityId, ...values })
      .onConflictDoUpdate({
        target: schema.communitySocialSettings.communityId,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return settings;
  }

  async findPost(postId: string) {
    const [post] = await this.db.select().from(schema.communityPosts)
      .where(and(eq(schema.communityPosts.id, postId), isNull(schema.communityPosts.deletedAt))).limit(1);
    return post;
  }

  async findComment(commentId: string) {
    const [comment] = await this.db.select().from(schema.communityPostComments)
      .where(and(eq(schema.communityPostComments.id, commentId), isNull(schema.communityPostComments.deletedAt)))
      .limit(1);
    return comment;
  }

  async createComment(postId: string, authorId: string, body: string, parentId?: string) {
    const [comment] = await this.db.insert(schema.communityPostComments)
      .values({ postId, authorId, body: body.trim(), parentId: parentId ?? null }).returning();
    if (!comment) return null;
    await this.db.update(schema.communityPosts)
      .set({ commentCount: sql`${schema.communityPosts.commentCount} + 1`, updatedAt: new Date() })
      .where(eq(schema.communityPosts.id, postId));

    // Fetch author information to return complete author object
    const [row] = await this.db.select({
      comment: schema.communityPostComments,
      author: { id: schema.users.id, fullName: schema.profiles.fullName, avatarUrl: schema.profiles.avatarUrl }
    }).from(schema.communityPostComments)
      .leftJoin(schema.users, eq(schema.communityPostComments.authorId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.communityPostComments.authorId, schema.profiles.userId))
      .where(eq(schema.communityPostComments.id, comment.id))
      .limit(1);

    return row ? { ...row.comment, author: row.author?.id ? row.author : null } : comment;
  }

  async updateComment(commentId: string, body: string) {
    const [comment] = await this.db.update(schema.communityPostComments)
      .set({ body: body.trim(), updatedAt: new Date() })
      .where(and(eq(schema.communityPostComments.id, commentId), isNull(schema.communityPostComments.deletedAt)))
      .returning();
    return comment;
  }

  async softDeleteComment(commentId: string) {
    const [comment] = await this.db.update(schema.communityPostComments)
      .set({ deletedAt: new Date(), status: 'HIDDEN', updatedAt: new Date() })
      .where(and(eq(schema.communityPostComments.id, commentId), isNull(schema.communityPostComments.deletedAt)))
      .returning();
    if (comment) {
      await this.db.update(schema.communityPosts)
        .set({ commentCount: sql`GREATEST(${schema.communityPosts.commentCount} - 1, 0)`, updatedAt: new Date() })
        .where(eq(schema.communityPosts.id, comment.postId));
    }
    return comment;
  }

  async moderateComment(commentId: string, status: 'PUBLISHED' | 'HIDDEN' | 'REJECTED', reason?: string) {
    const [comment] = await this.db.update(schema.communityPostComments)
      .set({ status, moderationReason: reason?.trim() || null, updatedAt: new Date() })
      .where(eq(schema.communityPostComments.id, commentId))
      .returning();
    return comment;
  }

  async listPendingPosts(communityId: string, limit = 50) {
    const rows = await this.db.select({
      post: schema.communityPosts,
      author: { id: schema.users.id, fullName: schema.profiles.fullName, avatarUrl: schema.profiles.avatarUrl },
    }).from(schema.communityPosts)
      .leftJoin(schema.users, eq(schema.communityPosts.authorId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.communityPosts.authorId, schema.profiles.userId))
      .where(and(eq(schema.communityPosts.communityId, communityId), eq(schema.communityPosts.status, 'PENDING'), isNull(schema.communityPosts.deletedAt)))
      .orderBy(desc(schema.communityPosts.createdAt)).limit(limit);
    return rows.map((row) => ({ ...row.post, author: row.author?.id ? row.author : null }));
  }

  async listComments(postId: string, limit: number, cursor?: string, viewerId?: string) {
    const conditions: SQL[] = [eq(schema.communityPostComments.postId, postId), eq(schema.communityPostComments.status, 'PUBLISHED'), isNull(schema.communityPostComments.deletedAt)];
    const decoded = cursor ? CursorPaginationHelper.decodeCursor<{ id: string; createdAt: string }>(cursor) : null;
    if (decoded?.createdAt && decoded.id) {
      conditions.push(or(lt(schema.communityPostComments.createdAt, new Date(decoded.createdAt)), and(eq(schema.communityPostComments.createdAt, new Date(decoded.createdAt)), lt(schema.communityPostComments.id, decoded.id))) as SQL);
    }
    const rows = await this.db.select({
      comment: schema.communityPostComments,
      author: { id: schema.users.id, fullName: schema.profiles.fullName, avatarUrl: schema.profiles.avatarUrl },
      reactionCount: sql<number>`(
        SELECT count(*)::int
        FROM ${schema.communityCommentReactions}
        WHERE ${schema.communityCommentReactions.commentId} = ${schema.communityPostComments.id}
      )`,
      viewerReaction: viewerId
        ? sql<string | null>`(
            SELECT ${schema.communityCommentReactions.reactionType}
            FROM ${schema.communityCommentReactions}
            WHERE ${schema.communityCommentReactions.commentId} = ${schema.communityPostComments.id}
              AND ${schema.communityCommentReactions.userId} = ${viewerId}
            LIMIT 1
          )`
        : sql<string | null>`NULL`,
    })
      .from(schema.communityPostComments).leftJoin(schema.users, eq(schema.communityPostComments.authorId, schema.users.id)).leftJoin(schema.profiles, eq(schema.communityPostComments.authorId, schema.profiles.userId))
      .where(and(...conditions)).orderBy(desc(schema.communityPostComments.createdAt), desc(schema.communityPostComments.id)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
      ...row.comment,
      author: row.author?.id ? row.author : null,
      reactionCount: Number(row.reactionCount ?? 0),
      viewerReaction: row.viewerReaction,
    }));
    const last = data[data.length - 1];
    return { data, meta: { limit, hasMore, nextCursor: hasMore && last ? CursorPaginationHelper.encodeCursor({ id: last.id, createdAt: last.createdAt }) : null } };
  }

  private groupReactionRows(rows: Array<{ reactionType: string; userId: string; fullName: string | null; avatarUrl: string | null }>, viewerId?: string) {
    const groups = new Map<string, { reactionType: string; count: number; isReacted: boolean; users: Array<{ id: string; fullName: string; avatarUrl: string | null }> }>();
    for (const row of rows) {
      const group = groups.get(row.reactionType) ?? {
        reactionType: row.reactionType,
        count: 0,
        isReacted: false,
        users: [],
      };
      group.count += 1;
      group.isReacted ||= row.userId === viewerId;
      group.users.push({
        id: row.userId,
        fullName: row.fullName?.trim() || 'Thành viên',
        avatarUrl: row.avatarUrl,
      });
      groups.set(row.reactionType, group);
    }
    return Array.from(groups.values());
  }

  async listPostReactions(postId: string, viewerId?: string) {
    const rows = await this.db.select({
      reactionType: schema.communityPostReactions.reactionType,
      userId: schema.communityPostReactions.userId,
      fullName: schema.profiles.fullName,
      avatarUrl: schema.profiles.avatarUrl,
    })
      .from(schema.communityPostReactions)
      .innerJoin(schema.users, eq(schema.communityPostReactions.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.communityPostReactions.userId, schema.profiles.userId))
      .where(eq(schema.communityPostReactions.postId, postId));
    return this.groupReactionRows(rows, viewerId);
  }

  async listCommentReactions(commentId: string, viewerId?: string) {
    const rows = await this.db.select({
      reactionType: schema.communityCommentReactions.reactionType,
      userId: schema.communityCommentReactions.userId,
      fullName: schema.profiles.fullName,
      avatarUrl: schema.profiles.avatarUrl,
    })
      .from(schema.communityCommentReactions)
      .innerJoin(schema.users, eq(schema.communityCommentReactions.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.communityCommentReactions.userId, schema.profiles.userId))
      .where(eq(schema.communityCommentReactions.commentId, commentId));
    return this.groupReactionRows(rows, viewerId);
  }

  async setCommentReaction(commentId: string, userId: string, reactionType: string) {
    const [existing] = await this.db.select().from(schema.communityCommentReactions)
      .where(and(
        eq(schema.communityCommentReactions.commentId, commentId),
        eq(schema.communityCommentReactions.userId, userId),
      )).limit(1);
    if (existing?.reactionType === reactionType) {
      await this.db.delete(schema.communityCommentReactions).where(eq(schema.communityCommentReactions.id, existing.id));
    } else if (existing) {
      await this.db.update(schema.communityCommentReactions)
        .set({ reactionType })
        .where(eq(schema.communityCommentReactions.id, existing.id));
    } else {
      await this.db.insert(schema.communityCommentReactions).values({ commentId, userId, reactionType });
    }
    const groups = await this.listCommentReactions(commentId, userId);
    return {
      reactionType: existing?.reactionType === reactionType ? null : reactionType,
      count: groups.reduce((sum, group) => sum + group.count, 0),
      reactionDetails: groups,
    };
  }

  async setReaction(postId: string, userId: string, reactionType: string) {
    const [existing] = await this.db.select().from(schema.communityPostReactions)
      .where(and(eq(schema.communityPostReactions.postId, postId), eq(schema.communityPostReactions.userId, userId))).limit(1);
    if (existing?.reactionType === reactionType) {
      await this.db.delete(schema.communityPostReactions).where(eq(schema.communityPostReactions.id, existing.id));
    } else if (existing) {
      await this.db.update(schema.communityPostReactions).set({ reactionType }).where(eq(schema.communityPostReactions.id, existing.id));
    } else {
      await this.db.insert(schema.communityPostReactions).values({ postId, userId, reactionType });
    }
    const reactions = await this.db.select({ id: schema.communityPostReactions.id }).from(schema.communityPostReactions).where(eq(schema.communityPostReactions.postId, postId));
    await this.db.update(schema.communityPosts).set({ reactionCount: reactions.length, updatedAt: new Date() }).where(eq(schema.communityPosts.id, postId));
    return { reactionType: existing?.reactionType === reactionType ? null : reactionType, count: reactions.length };
  }

  async createReport(values: { communityId: string; reporterId: string; postId?: string; commentId?: string; reason: string; details?: string }) {
    const [report] = await this.db.insert(schema.communitySocialReports).values(values).returning();
    return report;
  }

  async findOpenPostReport(communityId: string, postId: string, reporterId: string) {
    const [report] = await this.db.select({ id: schema.communitySocialReports.id })
      .from(schema.communitySocialReports)
      .where(and(
        eq(schema.communitySocialReports.communityId, communityId),
        eq(schema.communitySocialReports.postId, postId),
        eq(schema.communitySocialReports.reporterId, reporterId),
        eq(schema.communitySocialReports.status, 'OPEN'),
      ))
      .limit(1);
    return report ?? null;
  }

  async listReports(communityId: string, status?: string) {
    const conditions: SQL[] = [eq(schema.communitySocialReports.communityId, communityId)];
    if (status) conditions.push(eq(schema.communitySocialReports.status, status));
    return this.db.select({
      report: schema.communitySocialReports,
      post: { id: schema.communityPosts.id, body: schema.communityPosts.body, status: schema.communityPosts.status },
      reporter: { id: schema.users.id, fullName: schema.profiles.fullName, email: schema.users.email },
    })
      .from(schema.communitySocialReports)
      .leftJoin(schema.communityPosts, eq(schema.communitySocialReports.postId, schema.communityPosts.id))
      .leftJoin(schema.users, eq(schema.communitySocialReports.reporterId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.communitySocialReports.reporterId, schema.profiles.userId))
      .where(and(...conditions))
      .orderBy(asc(schema.communitySocialReports.status), desc(schema.communitySocialReports.createdAt));
  }

  async updateReportStatus(communityId: string, reportId: string, status: string) {
    const [updated] = await this.db.update(schema.communitySocialReports)
      .set({ status, resolvedAt: status === 'OPEN' || status === 'REVIEWING' ? null : new Date() })
      .where(and(eq(schema.communitySocialReports.id, reportId), eq(schema.communitySocialReports.communityId, communityId)))
      .returning();
    return updated ?? null;
  }

  async updatePreferences(communityId: string, userId: string, values: { muted: boolean; notificationsEnabled: boolean }) {
    const [preference] = await this.db.insert(schema.communityMemberSocialPreferences).values({ communityId, userId, ...values })
      .onConflictDoUpdate({ target: [schema.communityMemberSocialPreferences.communityId, schema.communityMemberSocialPreferences.userId], set: { ...values, updatedAt: new Date() } }).returning();
    return preference;
  }

  async getJoinedMentionIds(communityId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db.select({ userId: schema.communityMembers.userId }).from(schema.communityMembers)
      .where(and(eq(schema.communityMembers.communityId, communityId), eq(schema.communityMembers.status, 'JOINED'), inArray(schema.communityMembers.userId, ids)));
    return rows.map((row) => row.userId);
  }

  async getMentionNotificationPreferences(communityId: string, userIds: string[]) {
    if (userIds.length === 0) return [];
    return this.db
      .select({
        userId: schema.communityMembers.userId,
        notificationPreference: schema.communityMembers.notificationPreference,
        socialMuted: schema.communityMemberSocialPreferences.muted,
        socialNotificationsEnabled: schema.communityMemberSocialPreferences.notificationsEnabled,
      })
      .from(schema.communityMembers)
      .leftJoin(
        schema.communityMemberSocialPreferences,
        and(
          eq(schema.communityMemberSocialPreferences.communityId, schema.communityMembers.communityId),
          eq(schema.communityMemberSocialPreferences.userId, schema.communityMembers.userId),
        ),
      )
      .where(and(
        eq(schema.communityMembers.communityId, communityId),
        eq(schema.communityMembers.status, 'JOINED'),
        inArray(schema.communityMembers.userId, userIds),
      ));
  }

  async getAllNotificationPreferences(communityId: string, excludeUserId?: string) {
    const conditions = [
      eq(schema.communityMembers.communityId, communityId),
      eq(schema.communityMembers.status, 'JOINED'),
    ];
    if (excludeUserId) {
      conditions.push(sql`${schema.communityMembers.userId} != ${excludeUserId}`);
    }
    return this.db
      .select({
        userId: schema.communityMembers.userId,
        notificationPreference: schema.communityMembers.notificationPreference,
        socialMuted: schema.communityMemberSocialPreferences.muted,
        socialNotificationsEnabled: schema.communityMemberSocialPreferences.notificationsEnabled,
      })
      .from(schema.communityMembers)
      .leftJoin(
        schema.communityMemberSocialPreferences,
        and(
          eq(schema.communityMemberSocialPreferences.communityId, schema.communityMembers.communityId),
          eq(schema.communityMemberSocialPreferences.userId, schema.communityMembers.userId),
        ),
      )
      .where(and(...conditions));
  }

  async updatePostStatus(postId: string, status: 'PUBLISHED' | 'REJECTED' | 'HIDDEN') {
    const [post] = await this.db.update(schema.communityPosts).set({ status, updatedAt: new Date() }).where(eq(schema.communityPosts.id, postId)).returning();
    return post;
  }

  async softDeletePost(postId: string) {
    const [post] = await this.db.update(schema.communityPosts)
      .set({ deletedAt: new Date(), status: 'HIDDEN', updatedAt: new Date() })
      .where(and(eq(schema.communityPosts.id, postId), isNull(schema.communityPosts.deletedAt)))
      .returning();
    return post;
  }

  async createTournamentPost(
    communityId: string,
    authorId: string,
    tournamentId: string,
    tournamentName: string,
    bannerUrl?: string | null,
    isLite: boolean = false,
  ) {
    const mediaUrls = bannerUrl ? [bannerUrl] : [];
    const body = isLite
      ? `⚡ CLB vừa mở giải đấu nhanh: **${tournamentName}**! Nhấn vào thẻ giải đấu bên dưới để xem chi tiết và đăng ký tham gia.`
      : `🏆 CLB vừa công bố giải đấu mới: **${tournamentName}**! Các thành viên hãy nhấn vào thẻ giải đấu bên dưới để xem chi tiết và đăng ký tham gia.`;

    // 1. Check if post already exists for this tournament in the community
    const existingPosts = await this.db
      .select()
      .from(schema.communityPosts)
      .where(
        and(
          eq(schema.communityPosts.communityId, communityId),
          eq(schema.communityPosts.tournamentId, tournamentId),
          isNull(schema.communityPosts.deletedAt),
        ),
      )
      .orderBy(desc(schema.communityPosts.createdAt));

    if (existingPosts.length > 0) {
      const primaryPost = existingPosts[0];
      const [updatedPost] = await this.db
        .update(schema.communityPosts)
        .set({
          body,
          mediaUrls,
          updatedAt: new Date(),
        })
        .where(eq(schema.communityPosts.id, primaryPost.id))
        .returning();

      if (existingPosts.length > 1) {
        const duplicateIds = existingPosts.slice(1).map((p) => p.id);
        await this.db
          .update(schema.communityPosts)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(inArray(schema.communityPosts.id, duplicateIds));
      }

      return updatedPost ?? primaryPost;
    }

    const [post] = await this.db.insert(schema.communityPosts)
      .values({
        communityId,
        authorId,
        tournamentId,
        type: 'TOURNAMENT_ANNOUNCEMENT',
        body,
        mediaUrls,
        status: 'PUBLISHED',
      })
      .returning();

    return post;
  }

  async createTournamentBracketPost(
    communityId: string,
    authorId: string,
    tournamentId: string,
    tournamentName: string,
    divisionName: string | null,
    bracketKey: string,
  ) {
    const scopeLabel = divisionName ? ` (${divisionName})` : '';
    const body = `🏆 Sơ đồ thi đấu${scopeLabel} của giải **${tournamentName}** đã được tạo. Xem toàn bộ bracket và lịch đấu bên dưới.`;

    // 1. Check if there is an existing announcement or post for this tournament in the community
    const existingPosts = await this.db
      .select()
      .from(schema.communityPosts)
      .where(
        and(
          eq(schema.communityPosts.communityId, communityId),
          eq(schema.communityPosts.tournamentId, tournamentId),
          isNull(schema.communityPosts.deletedAt),
        ),
      )
      .orderBy(desc(schema.communityPosts.createdAt));

    if (existingPosts.length > 0) {
      const primaryPost = existingPosts[0];

      // Update the existing post: bump to top by updating createdAt, update body, set type to TOURNAMENT_BRACKET
      const [updatedPost] = await this.db
        .update(schema.communityPosts)
        .set({
          type: 'TOURNAMENT_BRACKET',
          body,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.communityPosts.id, primaryPost.id))
        .returning();

      // If duplicate posts existed for this tournament, clean them up
      if (existingPosts.length > 1) {
        const duplicateIds = existingPosts.slice(1).map((p) => p.id);
        await this.db
          .update(schema.communityPosts)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(inArray(schema.communityPosts.id, duplicateIds));
      }

      return updatedPost ?? primaryPost;
    }

    // 2. Fallback: If no existing post was found, insert a new bracket post
    const idempotencyKey = `tournament-bracket:${tournamentId}:${bracketKey}`.slice(0, 128);
    const [post] = await this.db
      .insert(schema.communityPosts)
      .values({
        communityId,
        authorId,
        tournamentId,
        type: 'TOURNAMENT_BRACKET',
        body,
        mediaUrls: [],
        status: 'PUBLISHED',
        idempotencyKey,
      })
      .onConflictDoNothing()
      .returning();
    return post ?? null;
  }

  async createPoll(
    communityId: string,
    creatorId: string,
    dto: { question: string; options: string[]; allowMultipleAnswers?: boolean; allowAddOptions?: boolean; expiresAt?: string },
    postId?: string,
  ) {
    const [poll] = await this.db
      .insert(schema.communityPolls)
      .values({
        communityId,
        creatorId,
        postId: postId ?? null,
        question: dto.question.trim(),
        allowMultipleAnswers: dto.allowMultipleAnswers ?? false,
        allowAddOptions: dto.allowAddOptions ?? true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      })
      .returning();

    if (!poll) return null;

    if (dto.options.length > 0) {
      await this.db.insert(schema.communityPollOptions).values(
        dto.options.map((opt) => ({
          pollId: poll.id,
          creatorId,
          optionText: opt.trim(),
        })),
      );
    }

    return this.getPollDetails(poll.id, creatorId);
  }

  async getPollDetails(pollId: string, viewerId?: string) {
    const [poll] = await this.db
      .select({
        poll: schema.communityPolls,
        creator: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
      })
      .from(schema.communityPolls)
      .leftJoin(schema.users, eq(schema.communityPolls.creatorId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.communityPolls.creatorId, schema.profiles.userId))
      .where(eq(schema.communityPolls.id, pollId))
      .limit(1);

    if (!poll) return null;

    const options = await this.db
      .select()
      .from(schema.communityPollOptions)
      .where(eq(schema.communityPollOptions.pollId, pollId))
      .orderBy(asc(schema.communityPollOptions.id));

    // Prioritize affirmative option (e.g. 'Có tham gia') at the top
    options.sort((a, b) => {
      const score = (text: string) => {
        if (text.includes('Có tham gia') || text.includes('Đăng ký') || text.includes('✅')) return 1;
        if (text.includes('Chưa chắc chắn') || text.includes('suy nghĩ') || text.includes('⏳')) return 2;
        if (text.includes('Không') || text.includes('Bận') || text.includes('❌')) return 3;
        return 2;
      };
      return score(a.optionText) - score(b.optionText);
    });

    const optionIds = options.map((o) => o.id);
    let votes: {
      optionId: string;
      userId: string;
      fullName: string | null;
      avatarUrl: string | null;
    }[] = [];

    if (optionIds.length > 0) {
      votes = await this.db
        .select({
          optionId: schema.communityPollVotes.optionId,
          userId: schema.communityPollVotes.userId,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        })
        .from(schema.communityPollVotes)
        .leftJoin(schema.users, eq(schema.communityPollVotes.userId, schema.users.id))
        .leftJoin(schema.profiles, eq(schema.communityPollVotes.userId, schema.profiles.userId))
        .where(inArray(schema.communityPollVotes.optionId, optionIds));
    }

    const totalVotes = votes.length;

    const optionsWithVoters = options.map((opt) => {
      const optVotes = votes.filter((v) => v.optionId === opt.id);
      const isVoted = viewerId ? optVotes.some((v) => v.userId === viewerId) : false;
      return {
        id: opt.id,
        pollId: opt.pollId,
        optionText: opt.optionText,
        voteCount: optVotes.length,
        isVoted,
        voters: optVotes.map((v) => ({
          id: v.userId,
          fullName: v.fullName || 'Thành viên',
          avatarUrl: v.avatarUrl,
        })),
      };
    });

    return {
      ...poll.poll,
      creator: poll.creator?.id ? poll.creator : null,
      totalVotes,
      options: optionsWithVoters,
    };
  }

  async getPollByPostId(postId: string, viewerId?: string) {
    const [poll] = await this.db
      .select({ id: schema.communityPolls.id })
      .from(schema.communityPolls)
      .where(eq(schema.communityPolls.postId, postId))
      .limit(1);

    if (!poll) return null;
    return this.getPollDetails(poll.id, viewerId);
  }

  async votePollOption(pollId: string, optionId: string, userId: string) {
    const [poll] = await this.db
      .select()
      .from(schema.communityPolls)
      .where(eq(schema.communityPolls.id, pollId))
      .limit(1);

    if (!poll) return null;

    // Check if already voted for this option
    const [existing] = await this.db
      .select()
      .from(schema.communityPollVotes)
      .where(
        and(
          eq(schema.communityPollVotes.optionId, optionId),
          eq(schema.communityPollVotes.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      // Toggle off / Unvote
      await this.db
        .delete(schema.communityPollVotes)
        .where(eq(schema.communityPollVotes.id, existing.id));
      await this.db
        .update(schema.communityPollOptions)
        .set({ voteCount: sql`GREATEST(${schema.communityPollOptions.voteCount} - 1, 0)` })
        .where(eq(schema.communityPollOptions.id, optionId));
    } else {
      // If single answer only, remove previous votes in this poll
      if (!poll.allowMultipleAnswers) {
        const userVotes = await this.db
          .select()
          .from(schema.communityPollVotes)
          .where(
            and(
              eq(schema.communityPollVotes.pollId, pollId),
              eq(schema.communityPollVotes.userId, userId),
            ),
          );

        for (const uv of userVotes) {
          await this.db
            .delete(schema.communityPollVotes)
            .where(eq(schema.communityPollVotes.id, uv.id));
          await this.db
            .update(schema.communityPollOptions)
            .set({ voteCount: sql`GREATEST(${schema.communityPollOptions.voteCount} - 1, 0)` })
            .where(eq(schema.communityPollOptions.id, uv.optionId));
        }
      }

      // Add vote
      await this.db.insert(schema.communityPollVotes).values({
        pollId,
        optionId,
        userId,
      });

      await this.db
        .update(schema.communityPollOptions)
        .set({ voteCount: sql`${schema.communityPollOptions.voteCount} + 1` })
        .where(eq(schema.communityPollOptions.id, optionId));
    }

    return this.getPollDetails(pollId, userId);
  }

  async addPollOption(pollId: string, creatorId: string, optionText: string) {
    const [created] = await this.db
      .insert(schema.communityPollOptions)
      .values({
        pollId,
        creatorId,
        optionText: optionText.trim(),
      })
      .returning();
    return created ? this.getPollDetails(pollId, creatorId) : null;
  }

  async closePoll(pollId: string) {
    const [updated] = await this.db
      .update(schema.communityPolls)
      .set({ isClosed: true, updatedAt: new Date() })
      .where(eq(schema.communityPolls.id, pollId))
      .returning();
    return updated ? this.getPollDetails(pollId) : null;
  }

  async softDeletePostsByTournamentId(tournamentId: string) {
    const deleted = await this.db.update(schema.communityPosts)
      .set({ deletedAt: new Date(), status: 'HIDDEN', updatedAt: new Date() })
      .where(and(eq(schema.communityPosts.tournamentId, tournamentId), isNull(schema.communityPosts.deletedAt)))
      .returning();
    return deleted;
  }
}
