import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb, AppDbOrTx } from '../../database/db.types';
import * as schema from '../../database/schema';

export type SocialSessionRow = typeof schema.socialSessions.$inferSelect;
export type SocialParticipantRow =
  typeof schema.socialSessionParticipants.$inferSelect;

export type JoinOutcome =
  | { ok: true; participant: SocialParticipantRow; currentSlots: number; status: string }
  | { ok: false; code: 'SESSION_NOT_FOUND' | 'SESSION_CLOSED' | 'SESSION_FULL' | 'ALREADY_JOINED' };

@Injectable()
export class SocialSessionsRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  getDb(): AppDb {
    return this.db;
  }

  async findCommunityById(id: string, tx: AppDbOrTx = this.db) {
    const [row] = await tx
      .select({ id: schema.communities.id, status: schema.communities.status })
      .from(schema.communities)
      .where(and(eq(schema.communities.id, id), isNull(schema.communities.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async findUserById(id: string, tx: AppDbOrTx = this.db) {
    const [row] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  async findCategoryBySlug(slug: string, tx: AppDbOrTx = this.db) {
    const [row] = await tx
      .select({ id: schema.categories.id, slug: schema.categories.slug })
      .from(schema.categories)
      .where(eq(schema.categories.slug, slug))
      .limit(1);
    return row ?? null;
  }

  /** Membership của user trong Club (null nếu không phải member). */
  async findMember(communityId: string, userId: string, tx: AppDbOrTx = this.db) {
    const [row] = await tx
      .select({
        role: schema.communityMembers.role,
        status: schema.communityMembers.status,
      })
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

  async findSessionById(id: string, tx: AppDbOrTx = this.db) {
    const [row] = await tx
      .select({
        session: schema.socialSessions,
        communityName: schema.communities.name,
        communityLogoUrl: schema.communities.logoUrl,
        categorySlug: schema.categories.slug,
        categoryName: schema.categories.name,
      })
      .from(schema.socialSessions)
      .leftJoin(
        schema.communities,
        eq(schema.communities.id, schema.socialSessions.communityId),
      )
      .leftJoin(
        schema.categories,
        eq(schema.categories.id, schema.socialSessions.categoryId),
      )
      .where(
        and(
          eq(schema.socialSessions.id, id),
          isNull(schema.socialSessions.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listByDate(
    filters: {
      playDate: string;
      categoryId?: string;
      communityId?: string;
      search?: string;
      page: number;
      limit: number;
    },
    tx: AppDbOrTx = this.db,
  ) {
    const conditions = [
      eq(schema.socialSessions.playDate, filters.playDate),
      sql`${schema.socialSessions.status} IN ('OPEN', 'FULL')`,
      isNull(schema.socialSessions.deletedAt),
    ];
    if (filters.categoryId) {
      conditions.push(eq(schema.socialSessions.categoryId, filters.categoryId));
    }
    if (filters.communityId) {
      conditions.push(eq(schema.socialSessions.communityId, filters.communityId));
    }
    const keyword = filters.search?.trim();
    if (keyword) {
      const like = `%${keyword}%`;
      conditions.push(
        or(
          ilike(schema.socialSessions.title, like),
          ilike(schema.socialSessions.venueName, like),
          ilike(schema.socialSessions.venueAddress, like),
        )!,
      );
    }
    const where = and(...conditions);
    const offset = (filters.page - 1) * filters.limit;

    const [items, totalRows] = await Promise.all([
      tx
        .select({
          session: schema.socialSessions,
          communityName: schema.communities.name,
          communityLogoUrl: schema.communities.logoUrl,
          categorySlug: schema.categories.slug,
        })
        .from(schema.socialSessions)
        .leftJoin(
          schema.communities,
          eq(schema.communities.id, schema.socialSessions.communityId),
        )
        .leftJoin(
          schema.categories,
          eq(schema.categories.id, schema.socialSessions.categoryId),
        )
        .where(where)
        .orderBy(asc(schema.socialSessions.startAt))
        .limit(filters.limit)
        .offset(offset),
      tx
        .select({ total: count() })
        .from(schema.socialSessions)
        .where(where),
    ]);
    return { items, total: Number(totalRows[0]?.total ?? 0) };
  }

  async listParticipants(sessionId: string, tx: AppDbOrTx = this.db) {
    return tx
      .select({
        participant: schema.socialSessionParticipants,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.socialSessionParticipants)
      .leftJoin(
        schema.profiles,
        eq(schema.profiles.userId, schema.socialSessionParticipants.userId),
      )
      .where(eq(schema.socialSessionParticipants.sessionId, sessionId))
      .orderBy(asc(schema.socialSessionParticipants.joinedAt));
  }

  async createWithHost(
    values: typeof schema.socialSessions.$inferInsert,
    hostUserId: string,
    tx: AppDbOrTx = this.db,
  ) {
    const runner = tx === this.db ? this.db.transaction(async (t) => run(t)) : run(tx);
    return runner;

    async function run(t: AppDbOrTx) {
      const [session] = await t
        .insert(schema.socialSessions)
        .values(values)
        .returning();
      const [host] = await t
        .insert(schema.socialSessionParticipants)
        .values({
          sessionId: session.id,
          userId: hostUserId,
          role: 'HOST',
          status: 'JOINED',
          paymentStatus: 'UNPAID',
          ticketCount: 1,
        })
        .returning();
      return { session, host };
    }
  }

  /**
   * Core join/add: khóa row session (FOR UPDATE), check capacity, insert hoặc
   * reactivate participant, cộng slot. Dùng chung cho member tự join và admin thêm người.
   */
  async joinOrAddParticipant(
    sessionId: string,
    userId: string,
    ticketCount: number,
    role: 'HOST' | 'PLAYER' = 'PLAYER',
  ): Promise<JoinOutcome> {
    return this.db.transaction(async (tx) => {
      const locked = (await tx.execute(sql`
        SELECT id, current_slots, max_slots, status, visibility, community_id
        FROM social_sessions
        WHERE id = ${sessionId} AND deleted_at IS NULL
        FOR UPDATE
      `)) as unknown as Array<{
        id: string;
        current_slots: number;
        max_slots: number;
        status: string;
        visibility: string;
        community_id: string | null;
      }>;
      const session = locked[0];
      if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' } as const;
      if (session.status !== 'OPEN' && session.status !== 'FULL') {
        return { ok: false, code: 'SESSION_CLOSED' } as const;
      }

      const [existing] = await tx
        .select()
        .from(schema.socialSessionParticipants)
        .where(
          and(
            eq(schema.socialSessionParticipants.sessionId, sessionId),
            eq(schema.socialSessionParticipants.userId, userId),
          ),
        )
        .limit(1);

      if (existing && existing.status === 'JOINED') {
        return { ok: false, code: 'ALREADY_JOINED' } as const;
      }

      if (session.current_slots + ticketCount > session.max_slots) {
        return { ok: false, code: 'SESSION_FULL' } as const;
      }

      let participant: SocialParticipantRow;
      if (existing) {
        // Reactivate: slot cũ đã được giải phóng khi CANCELLED/KICKED nên cộng mới hoàn toàn.
        const [updated] = await tx
          .update(schema.socialSessionParticipants)
          .set({ status: 'JOINED', ticketCount, role })
          .where(eq(schema.socialSessionParticipants.id, existing.id))
          .returning();
        participant = updated;
      } else {
        const [created] = await tx
          .insert(schema.socialSessionParticipants)
          .values({ sessionId, userId, role, status: 'JOINED', ticketCount })
          .onConflictDoNothing({
            target: [
              schema.socialSessionParticipants.sessionId,
              schema.socialSessionParticipants.userId,
            ],
          })
          .returning();
        if (!created) return { ok: false, code: 'ALREADY_JOINED' } as const;
        participant = created;
      }

      const currentSlots = session.current_slots + ticketCount;
      const status = currentSlots >= session.max_slots ? 'FULL' : 'OPEN';
      await tx
        .update(schema.socialSessions)
        .set({ currentSlots, status, updatedAt: new Date() })
        .where(eq(schema.socialSessions.id, sessionId));

      return { ok: true, participant, currentSlots, status };
    });
  }

  /** Rời/kick: đổi status + giải phóng slot trong cùng transaction. */
  async removeParticipant(
    sessionId: string,
    userId: string,
    nextStatus: 'CANCELLED' | 'KICKED',
  ) {
    return this.db.transaction(async (tx) => {
      const locked = (await tx.execute(sql`
        SELECT id, current_slots
        FROM social_sessions
        WHERE id = ${sessionId} AND deleted_at IS NULL
        FOR UPDATE
      `)) as unknown as Array<{ id: string; current_slots: number }>;
      if (!locked[0]) return null;

      const [existing] = await tx
        .select()
        .from(schema.socialSessionParticipants)
        .where(
          and(
            eq(schema.socialSessionParticipants.sessionId, sessionId),
            eq(schema.socialSessionParticipants.userId, userId),
          ),
        )
        .limit(1);
      if (!existing || existing.status !== 'JOINED') return null;

      const [updated] = await tx
        .update(schema.socialSessionParticipants)
        .set({ status: nextStatus })
        .where(eq(schema.socialSessionParticipants.id, existing.id))
        .returning();

      const currentSlots = Math.max(1, locked[0].current_slots - existing.ticketCount);
      await tx
        .update(schema.socialSessions)
        .set({
          currentSlots,
          status: 'OPEN',
          updatedAt: new Date(),
        })
        .where(eq(schema.socialSessions.id, sessionId));

      return updated;
    });
  }

  async updateSession(
    id: string,
    patch: Partial<typeof schema.socialSessions.$inferInsert>,
  ) {
    const [updated] = await this.db
      .update(schema.socialSessions)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(schema.socialSessions.id, id),
          isNull(schema.socialSessions.deletedAt),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async softDelete(id: string) {
    return this.updateSession(id, { status: 'CANCELLED', deletedAt: new Date() });
  }

  async updatePaymentStatus(
    sessionId: string,
    userId: string,
    paymentStatus: 'UNPAID' | 'PAID' | 'PENDING',
  ) {
    const [updated] = await this.db
      .update(schema.socialSessionParticipants)
      .set({ paymentStatus })
      .where(
        and(
          eq(schema.socialSessionParticipants.sessionId, sessionId),
          eq(schema.socialSessionParticipants.userId, userId),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async recentSessionsByHost(hostUserId: string, limit = 20) {
    return this.db
      .select()
      .from(schema.socialSessions)
      .where(
        and(
          eq(schema.socialSessions.hostUserId, hostUserId),
          isNull(schema.socialSessions.deletedAt),
        ),
      )
      .orderBy(desc(schema.socialSessions.createdAt))
      .limit(limit);
  }
}
