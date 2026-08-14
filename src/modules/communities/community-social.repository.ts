import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { AppDb } from '../../database/db.types';
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

  async listPosts(communityId: string, limit: number, cursor?: string, viewerId?: string) {
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

    // Attach poll data if post has a poll
    const postIds = initialData.map((p) => p.id);
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

    const data = initialData.map((p) => ({
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

  async updateSettings(communityId: string, values: Partial<Pick<typeof schema.communitySocialSettings.$inferInsert, 'postingPolicy' | 'postApprovalRequired' | 'commentsEnabled' | 'chatEnabled' | 'publicFeed' | 'memberTaggingPolicy'>>) {
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

  async listComments(postId: string, limit: number, cursor?: string) {
    const conditions: SQL[] = [eq(schema.communityPostComments.postId, postId), eq(schema.communityPostComments.status, 'PUBLISHED'), isNull(schema.communityPostComments.deletedAt)];
    const decoded = cursor ? CursorPaginationHelper.decodeCursor<{ id: string; createdAt: string }>(cursor) : null;
    if (decoded?.createdAt && decoded.id) {
      conditions.push(or(lt(schema.communityPostComments.createdAt, new Date(decoded.createdAt)), and(eq(schema.communityPostComments.createdAt, new Date(decoded.createdAt)), lt(schema.communityPostComments.id, decoded.id))) as SQL);
    }
    const rows = await this.db.select({ comment: schema.communityPostComments, author: { id: schema.users.id, fullName: schema.profiles.fullName, avatarUrl: schema.profiles.avatarUrl } })
      .from(schema.communityPostComments).leftJoin(schema.users, eq(schema.communityPostComments.authorId, schema.users.id)).leftJoin(schema.profiles, eq(schema.communityPostComments.authorId, schema.profiles.userId))
      .where(and(...conditions)).orderBy(desc(schema.communityPostComments.createdAt), desc(schema.communityPostComments.id)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const data = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({ ...row.comment, author: row.author?.id ? row.author : null }));
    const last = data[data.length - 1];
    return { data, meta: { limit, hasMore, nextCursor: hasMore && last ? CursorPaginationHelper.encodeCursor({ id: last.id, createdAt: last.createdAt }) : null } };
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
  ) {
    const mediaUrls = bannerUrl ? [bannerUrl] : [];
    const body = `🏆 CLB vừa công bố giải đấu mới: **${tournamentName}**! Các thành viên hãy nhanh tay đăng ký tham gia ngay.`;
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
      .orderBy(schema.communityPollOptions.createdAt);

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

