import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq, and, or } from 'drizzle-orm';

@Injectable()
export class SocialRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createFriendRequest(senderId: string, receiverId: string) {
    const [record] = await this.db
      .insert(schema.friendships)
      .values({
        senderId,
        receiverId,
        status: 'PENDING',
      })
      .returning();
    return record;
  }

  async findFriendship(userA: string, userB: string) {
    const [record] = await this.db
      .select()
      .from(schema.friendships)
      .where(
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
      )
      .limit(1);
    return record || null;
  }

  async updateFriendshipStatus(id: string, status: string) {
    const [updated] = await this.db
      .update(schema.friendships)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.friendships.id, id))
      .returning();
    return updated;
  }

  async getFriends(userId: string) {
    // Để cho đơn giản, chỉ join bảng users để lấy thông tin
    // Do Drizzle ORM Relational Queries cần setup cẩn thận, 
    // ta dùng SQL query builder thường.
    const result = await this.db
      .select({
        friendshipId: schema.friendships.id,
        status: schema.friendships.status,
        friendId: schema.profiles.userId,
        friendName: schema.profiles.fullName,
        friendAvatar: schema.profiles.avatarUrl,
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
        or(
          eq(schema.friendships.senderId, userId),
          eq(schema.friendships.receiverId, userId),
        ),
      );

    return result;
  }
}
