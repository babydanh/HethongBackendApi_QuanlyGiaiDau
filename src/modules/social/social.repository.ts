import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { aliasedTable, and, desc, eq, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { CursorPaginationHelper } from '../../common/helpers/cursor-pagination.helper';

@Injectable()
export class SocialRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async findActiveUser(userId: string) {
    const [record] = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.id, userId),
          isNull(schema.users.deletedAt),
        ),
      )
      .limit(1);
    return record || null;
  }

  async createFriendRequest(senderId: string, receiverId: string) {
    const [record] = await this.db
      .insert(schema.friendships)
      .values({
        senderId,
        receiverId,
        status: 'PENDING',
      })
      .onConflictDoNothing()
      .returning();
    return record || null;
  }

  async findFriendship(userA: string, userB: string) {
    const [record] = await this.db
      .select()
      .from(schema.friendships)
      .where(
        and(
          isNull(schema.friendships.deletedAt),
          or(
            and(
              eq(schema.friendships.senderId, userA),
              eq(schema.friendships.receiverId, userB),
            ),
            and(
              eq(schema.friendships.senderId, userB),
              eq(schema.friendships.receiverId, userA),
            ),
          ),
        ),
      )
      .limit(1);
    return record || null;
  }

  async findFriendshipById(id: string) {
    const [record] = await this.db
      .select()
      .from(schema.friendships)
      .where(
        and(
          eq(schema.friendships.id, id),
          isNull(schema.friendships.deletedAt),
        ),
      )
      .limit(1);
    return record || null;
  }

  async updateFriendshipStatus(id: string, receiverId: string, status: string) {
    const [updated] = await this.db
      .update(schema.friendships)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(schema.friendships.id, id),
          eq(schema.friendships.receiverId, receiverId),
          eq(schema.friendships.status, 'PENDING'),
          isNull(schema.friendships.deletedAt),
        ),
      )
      .returning();
    return updated || null;
  }

  async softDeleteFriendship(id: string, actorId: string) {
    const [updated] = await this.db
      .update(schema.friendships)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.friendships.id, id),
          isNull(schema.friendships.deletedAt),
          or(
            and(
              eq(schema.friendships.senderId, actorId),
              eq(schema.friendships.status, 'PENDING'),
            ),
            and(
              eq(schema.friendships.status, 'ACCEPTED'),
              or(
                eq(schema.friendships.senderId, actorId),
                eq(schema.friendships.receiverId, actorId),
              ),
            ),
          ),
        ),
      )
      .returning();
    return updated || null;
  }

  async getFriends(userId: string) {
    // Để cho đơn giản, chỉ join bảng users để lấy thông tin
    // Do Drizzle ORM Relational Queries cần setup cẩn thận, 
    // ta dùng SQL query builder thường.
    const result = await this.db
      .select({
        friendshipId: schema.friendships.id,
        status: schema.friendships.status,
        senderId: schema.friendships.senderId,
        receiverId: schema.friendships.receiverId,
        friendId: schema.profiles.userId,
        friendName: schema.profiles.fullName,
        friendAvatar: schema.profiles.avatarUrl,
        direction: sql<'INCOMING' | 'OUTGOING'>`case when ${schema.friendships.receiverId} = ${userId} then 'INCOMING' else 'OUTGOING' end`,
      })
      .from(schema.friendships)
      .innerJoin(
        schema.profiles,
        or(
          and(
            eq(schema.friendships.senderId, userId),
            eq(schema.profiles.userId, schema.friendships.receiverId),
          ),
          and(
            eq(schema.friendships.receiverId, userId),
            eq(schema.profiles.userId, schema.friendships.senderId),
          ),
        ),
      )
      .where(
        and(
          isNull(schema.friendships.deletedAt),
          or(
            eq(schema.friendships.senderId, userId),
            eq(schema.friendships.receiverId, userId),
          ),
        ),
      );

    return result;
  }

  async createProfilePost(values: {
    authorId: string;
    body: string | null;
    mediaUrls: string[];
    visibility: 'PUBLIC' | 'FRIENDS' | 'ONLY_ME';
    status?: 'PUBLISHED' | 'PENDING';
    sharedPostId?: string | null;
    idempotencyKey?: string | null;
  }) {
    const [created] = await this.db
      .insert(schema.communityPosts)
      .values({
        communityId: null,
        authorId: values.authorId,
        body: values.body,
        mediaUrls: values.mediaUrls,
        visibility: values.visibility,
        sharedPostId: values.sharedPostId ?? null,
        idempotencyKey: values.idempotencyKey ?? null,
        status: values.status ?? 'PUBLISHED',
      })
      .onConflictDoNothing()
      .returning();

    if (created) return this.getProfilePost(created.id, values.authorId);
    if (values.idempotencyKey) {
      const [reused] = await this.db
        .select({ id: schema.communityPosts.id })
        .from(schema.communityPosts)
        .where(
          and(
            isNull(schema.communityPosts.communityId),
            eq(schema.communityPosts.authorId, values.authorId),
            eq(schema.communityPosts.idempotencyKey, values.idempotencyKey),
            isNull(schema.communityPosts.deletedAt),
          ),
        )
        .limit(1);
      if (reused) return this.getProfilePost(reused.id, values.authorId);
    }
    return null;
  }

  async getProfilePost(postId: string, viewerId?: string) {
    const original = aliasedTable(schema.communityPosts, 'profile_original_post');
    const originalProfile = aliasedTable(schema.profiles, 'profile_original_author');
    const [row] = await this.db
      .select({
        post: schema.communityPosts,
        author: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
        sharedPost: {
          id: original.id,
          body: original.body,
          authorId: original.authorId,
          authorName: originalProfile.fullName,
          authorAvatarUrl: originalProfile.avatarUrl,
          visibility: original.visibility,
          status: original.status,
          deletedAt: original.deletedAt,
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
      .leftJoin(original, eq(schema.communityPosts.sharedPostId, original.id))
      .leftJoin(originalProfile, eq(original.authorId, originalProfile.userId))
      .where(
        and(
          eq(schema.communityPosts.id, postId),
          isNull(schema.communityPosts.communityId),
          isNull(schema.communityPosts.deletedAt),
        ),
      )
      .limit(1);
    return row ? this.mapProfilePostRow(row) : null;
  }

  async listProfilePosts(input: {
    viewerId: string;
    authorId?: string;
    limit: number;
    cursor?: string;
  }) {
    const post = schema.communityPosts;
    const friendship = sql`EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = 'ACCEPTED'
        AND f.deleted_at IS NULL
        AND ((f.sender_id = ${post.authorId} AND f.receiver_id = ${input.viewerId})
          OR (f.receiver_id = ${post.authorId} AND f.sender_id = ${input.viewerId}))
    )`;
    const statusCondition = input.authorId === input.viewerId
      ? or(eq(post.status, 'PUBLISHED'), eq(post.status, 'PENDING'))
      : eq(post.status, 'PUBLISHED');
    const conditions: SQL[] = [
      isNull(post.communityId),
      eq(post.visibility, 'FRIENDS'),
      statusCondition as SQL,
      isNull(post.deletedAt),
    ];
    if (input.authorId) {
      conditions.push(eq(post.authorId, input.authorId));
      if (input.authorId !== input.viewerId) {
        conditions.push(friendship);
      }
    } else {
      conditions.push(
        or(
          eq(post.authorId, input.viewerId),
          friendship,
        ) as SQL,
      );
    }

    const decoded = input.cursor
      ? CursorPaginationHelper.decodeCursor<{ id: string; createdAt: string }>(input.cursor)
      : null;
    if (input.cursor && (!decoded?.id || !decoded.createdAt || Number.isNaN(new Date(decoded.createdAt).getTime()))) {
      return { invalidCursor: true as const };
    }
    if (decoded) {
      conditions.push(
        or(
          lt(post.createdAt, new Date(decoded.createdAt)),
          and(eq(post.createdAt, new Date(decoded.createdAt)), lt(post.id, decoded.id)),
        ) as SQL,
      );
    }

    const original = aliasedTable(schema.communityPosts, 'profile_feed_original_post');
    const originalProfile = aliasedTable(schema.profiles, 'profile_feed_original_author');
    const rows = await this.db
      .select({
        post,
        author: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
        sharedPost: {
          id: original.id,
          body: original.body,
          authorId: original.authorId,
          authorName: originalProfile.fullName,
          authorAvatarUrl: originalProfile.avatarUrl,
          visibility: original.visibility,
          status: original.status,
          deletedAt: original.deletedAt,
        },
        viewerReaction: sql<string | null>`(
          SELECT ${schema.communityPostReactions.reactionType}
          FROM ${schema.communityPostReactions}
          WHERE ${schema.communityPostReactions.postId} = ${post.id}
            AND ${schema.communityPostReactions.userId} = ${input.viewerId}
          LIMIT 1
        )`,
      })
      .from(post)
      .leftJoin(schema.users, eq(post.authorId, schema.users.id))
      .leftJoin(schema.profiles, eq(post.authorId, schema.profiles.userId))
      .leftJoin(original, eq(post.sharedPostId, original.id))
      .leftJoin(originalProfile, eq(original.authorId, originalProfile.userId))
      .where(and(...conditions))
      .orderBy(desc(post.createdAt), desc(post.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const data = (hasMore ? rows.slice(0, input.limit) : rows).map((row) => this.mapProfilePostRow(row));
    const last = data[data.length - 1];
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

  async deleteProfilePost(postId: string, authorId: string) {
    const [updated] = await this.db
      .update(schema.communityPosts)
      .set({ deletedAt: new Date(), status: 'HIDDEN', updatedAt: new Date() })
      .where(
        and(
          eq(schema.communityPosts.id, postId),
          eq(schema.communityPosts.authorId, authorId),
          isNull(schema.communityPosts.communityId),
          isNull(schema.communityPosts.deletedAt),
        ),
      )
      .returning();
    return updated ?? null;
  }

  private mapProfilePostRow(row: any) {
    const sharedPost = row.sharedPost?.id && !row.sharedPost.deletedAt && row.sharedPost.status === 'PUBLISHED'
      ? row.sharedPost
      : null;
    return {
      ...row.post,
      author: row.author?.id ? row.author : null,
      sharedPost,
      viewerReaction: row.viewerReaction,
    };
  }
}


