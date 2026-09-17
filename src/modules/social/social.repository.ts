import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, or, isNull, sql } from 'drizzle-orm';

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
}


