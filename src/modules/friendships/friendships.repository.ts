import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';

export type FriendshipRow = typeof schema.friendships.$inferSelect;

export interface FriendshipListItem {
  friendshipId: string;
  status: string;
  direction: 'NONE' | 'INCOMING' | 'OUTGOING';
  senderId: string;
  receiverId: string;
  friendId: string;
  friendName: string | null;
  friendAvatar: string | null;
}

export interface FriendshipStatusView {
  id: string | null;
  status: 'NONE' | 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED';
  direction: 'NONE' | 'INCOMING' | 'OUTGOING';
  senderId: string | null;
  receiverId: string | null;
}

/**
 * Truy cập bảng `friendships`.
 *
 * Bảng vẫn còn trong schema (src/database/schema/social.schema.ts) nhưng
 * controller của module social đã bị gỡ, nên web gọi `/social/*` trả 404.
 * Repository này phục vụ lại đúng các route mà web đang khai báo tại
 * `src/features/social/api.ts`.
 *
 * Quy ước: mỗi cặp người dùng chỉ có một quan hệ đang hoạt động
 * (`uq_friendships_active_unordered_pair`), nên mọi truy vấn đều lọc
 * `deleted_at IS NULL` thay vì dựa vào trạng thái.
 */
@Injectable()
export class FriendshipsRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  /**
   * Quan hệ đang hoạt động giữa hai người, không quan tâm ai gửi trước.
   */
  async findActiveBetween(
    userA: string,
    userB: string,
  ): Promise<FriendshipRow | undefined> {
    const rows = await this.db
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
    return rows[0];
  }

  /**
   * Toàn bộ quan hệ đang hoạt động của một người, mới nhất trước.
   */
  async listActiveForUser(userId: string): Promise<FriendshipRow[]> {
    return this.db
      .select()
      .from(schema.friendships)
      .where(
        and(
          isNull(schema.friendships.deletedAt),
          or(
            eq(schema.friendships.senderId, userId),
            eq(schema.friendships.receiverId, userId),
          ),
        ),
      )
      .orderBy(desc(schema.friendships.updatedAt));
  }

  async findById(id: string): Promise<FriendshipRow | undefined> {
    const rows = await this.db
      .select()
      .from(schema.friendships)
      .where(eq(schema.friendships.id, id))
      .limit(1);
    return rows[0];
  }

  async insert(row: typeof schema.friendships.$inferInsert) {
    const rows = await this.db
      .insert(schema.friendships)
      .values(row)
      .returning();
    return rows[0];
  }

  async updateById(
    id: string,
    patch: Partial<Pick<FriendshipRow, 'status' | 'updatedAt'>>,
  ) {
    const rows = await this.db
      .update(schema.friendships)
      .set(patch)
      .where(eq(schema.friendships.id, id))
      .returning();
    return rows[0];
  }

  /**
   * Huỷ quan hệ bằng soft delete để giữ lịch sử, đúng với
   * `2026-09-17_harden_friendships_integrity.sql`.
   */
  async softDelete(id: string) {
    const rows = await this.db
      .update(schema.friendships)
      .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(eq(schema.friendships.id, id), isNull(schema.friendships.deletedAt)),
      )
      .returning();
    return rows[0];
  }

  /**
   * Tên/avatar của một danh sách user, tra một lần thay vì N+1.
   */
  async profilesFor(userIds: string[]): Promise<Map<string, { name: string; avatar: string | null }>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: schema.profiles.userId, name: schema.profiles.fullName, avatar: schema.profiles.avatarUrl })
      .from(schema.profiles)
      .where(sql`${schema.profiles.userId} = ANY(${userIds})`);
    return new Map(rows.map((row) => [row.id, { name: row.name, avatar: row.avatar }]));
  }
}
