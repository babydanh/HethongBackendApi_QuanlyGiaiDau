import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, isNull, lt, or, inArray, sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb, AppTx } from '../../database/db.types';
import * as schema from '../../database/schema';
import { CursorPaginationHelper } from '../../common/helpers/cursor-pagination.helper';
import { locationRegionCondition, type LocationRegion } from '../../common/helpers/location-region.helper';

export type SocialPickupProjection = {
  pickup: typeof schema.socialPickupSessions.$inferSelect;
  host: { id: string; name: string | null; avatarUrl: string | null };
  category: { id: string; name: string; slug: string };
  participantCount: number;
  participants: Array<{ userId: string; name: string | null; avatarUrl: string | null }>;
  isJoined: boolean;
  myStatus?: 'JOINED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN' | null;
  pendingRequests?: Array<{
    id: string;
    userId: string;
    name: string | null;
    avatarUrl: string | null;
    note: string | null;
    createdAt: Date;
  }>;
};

type CursorValue = { id: string; createdAt: string };

@Injectable()
export class SocialPickupsRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  async findCategory(categoryId: string) {
    const [row] = await this.db
      .select({
        id: schema.categories.id,
        name: schema.categories.name,
        slug: schema.categories.slug,
      })
      .from(schema.categories)
      .where(eq(schema.categories.id, categoryId))
      .limit(1);
    return row ?? null;
  }

  async findHostProvinceCode(userId: string) {
    const [profile] = await this.db
      .select({ provinceCode: schema.profiles.provinceCode })
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId))
      .limit(1);
    return profile?.provinceCode ?? null;
  }

  async findVenueCourt(venueId: string, courtId?: string): Promise<{
    venueId: string;
    venueName: string;
    venueAddress: string;
    courtId: string | null;
    courtName: string | null;
  } | null> {
    const [row] = await this.db
      .select({
        venueId: schema.tournamentVenues.id,
        venueName: schema.tournamentVenues.name,
        venueAddress: schema.tournamentVenues.locationAddress,
        courtId: schema.venueCourts.id,
        courtName: schema.venueCourts.courtName,
      })
      .from(schema.tournamentVenues)
      .leftJoin(
        schema.venueCourts,
        eq(schema.venueCourts.venueId, schema.tournamentVenues.id),
      )
      .where(
        and(
          eq(schema.tournamentVenues.id, venueId),
          isNull(schema.tournamentVenues.deletedAt),
          courtId ? eq(schema.venueCourts.id, courtId) : sql`true`,
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findPickupForUpdate(id: string, tx: AppTx = this.db as unknown as AppTx) {
    const [row] = await tx
      .select()
      .from(schema.socialPickupSessions)
      .where(
        and(
          eq(schema.socialPickupSessions.id, id),
          isNull(schema.socialPickupSessions.deletedAt),
          isNull(schema.socialPickupSessions.communityId),
        ),
      )
      .for('update')
      .limit(1);
    return row ?? null;
  }

  async findByCreationKey(hostUserId: string, key: string, tx: AppDb | AppTx = this.db) {
    const [row] = await tx
      .select()
      .from(schema.socialPickupSessions)
      .where(
        and(
          eq(schema.socialPickupSessions.hostUserId, hostUserId),
          eq(schema.socialPickupSessions.creationIdempotencyKey, key),
          isNull(schema.socialPickupSessions.deletedAt),
          isNull(schema.socialPickupSessions.communityId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async createPickup(input: {
    hostUserId: string;
    categoryId: string;
    title: string;
    description: string | null;
    playDate: string;
    startTime: string;
    endTime: string;
    location: string;
    provinceCode?: string | null;
    wardCode?: string | null;
    imageUrls?: string[];
    venueId?: string | null;
    courtId?: string | null;
    feePerSlot: number;
    maxSlots: number;
    levelRequirement: string;
    genderRequirement: string;
    creationIdempotencyKey?: string | null;
    creationFingerprint?: string | null;
  }) {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.socialPickupSessions)
        .values({
          hostUserId: input.hostUserId,
          communityId: null,
          categoryId: input.categoryId,
          title: input.title,
          description: input.description,
          playDate: input.playDate,
          startTime: input.startTime,
          endTime: input.endTime,
          courtLocation: input.location,
          metadata: {
            location: {
              ...(input.provinceCode ? { provinceCode: input.provinceCode } : {}),
              ...(input.wardCode ? { wardCode: input.wardCode } : {}),
            },
            ...(input.imageUrls?.length ? { mediaUrls: input.imageUrls } : {}),
          },
          venueId: input.venueId ?? null,
          courtId: input.courtId ?? null,
          feePerSlot: input.feePerSlot,
          maxSlots: input.maxSlots,
          currentSlots: 1,
          levelRequirement: input.levelRequirement,
          genderRequirement: input.genderRequirement,
          isClubExclusive: false,
          isRanked: false,
          status: 'OPEN',
          creationIdempotencyKey: input.creationIdempotencyKey ?? null,
          creationFingerprint: input.creationFingerprint ?? null,
        })
        .onConflictDoNothing({
          target: [
            schema.socialPickupSessions.hostUserId,
            schema.socialPickupSessions.creationIdempotencyKey,
          ],
          // creation_key_unique is a partial unique index. PostgreSQL needs
          // the same predicate here or it cannot infer the conflict target.
          where: sql`${schema.socialPickupSessions.creationIdempotencyKey} IS NOT NULL`,
        })
        .returning();

      if (!created) {
        const existing = input.creationIdempotencyKey
          ? await this.findByCreationKey(input.hostUserId, input.creationIdempotencyKey, tx)
          : null;
        if (!existing) throw new Error('SOCIAL_PICKUP_CREATE_CONFLICT');
        return existing;
      }

      await tx.insert(schema.socialPickupParticipants).values({
        pickupId: created.id,
        userId: input.hostUserId,
        role: 'HOST',
        status: 'JOINED',
      });
      return created;
    });
  }

  async findParticipant(pickupId: string, userId: string, tx: AppDb | AppTx = this.db) {
    const [row] = await tx
      .select()
      .from(schema.socialPickupParticipants)
      .where(
        and(
          eq(schema.socialPickupParticipants.pickupId, pickupId),
          eq(schema.socialPickupParticipants.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async countJoinedParticipants(pickupId: string, tx: AppDb | AppTx = this.db) {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.socialPickupParticipants)
      .where(
        and(
          eq(schema.socialPickupParticipants.pickupId, pickupId),
          eq(schema.socialPickupParticipants.status, 'JOINED'),
        ),
      );
    return Number(row?.count ?? 0);
  }

  async joinPickup(id: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const pickup = await this.findPickupForUpdate(id, tx);
      if (!pickup) return { kind: 'NOT_FOUND' as const };
      if (pickup.status === 'CANCELLED' || pickup.status === 'COMPLETED' || pickup.status === 'IN_PROGRESS') {
        return { kind: 'TERMINAL' as const, pickup };
      }

      const existing = await this.findParticipant(id, userId, tx);
      if (existing?.status === 'JOINED') {
        return { kind: 'ALREADY_JOINED' as const, pickup, participant: existing };
      }

      const count = await this.countJoinedParticipants(id, tx);
      if (count >= pickup.maxSlots) {
        if (pickup.status !== 'FULL') {
          await tx
            .update(schema.socialPickupSessions)
            .set({ status: 'FULL', currentSlots: count, updatedAt: new Date() })
            .where(eq(schema.socialPickupSessions.id, id));
        }
        return { kind: 'FULL' as const, pickup };
      }

      const participant = existing
        ? (await tx
            .update(schema.socialPickupParticipants)
            .set({ status: 'JOINED', joinedAt: new Date() })
            .where(eq(schema.socialPickupParticipants.id, existing.id))
            .returning())[0]
        : (await tx
            .insert(schema.socialPickupParticipants)
            .values({ pickupId: id, userId, role: 'PLAYER', status: 'JOINED' })
            .returning())[0];

      const nextCount = count + 1;
      const [updated] = await tx
        .update(schema.socialPickupSessions)
        .set({
          currentSlots: nextCount,
          status: nextCount >= pickup.maxSlots ? 'FULL' : 'OPEN',
          updatedAt: new Date(),
        })
        .where(eq(schema.socialPickupSessions.id, id))
        .returning();

      return { kind: 'JOINED' as const, pickup: updated ?? pickup, participant };
    });
  }

  async withdrawPickup(id: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const pickup = await this.findPickupForUpdate(id, tx);
      if (!pickup) return { kind: 'NOT_FOUND' as const };
      if (pickup.hostUserId === userId) return { kind: 'HOST_CANNOT_WITHDRAW' as const, pickup };

      const existing = await this.findParticipant(id, userId, tx);
      if (!existing || existing.status !== 'JOINED') {
        return { kind: 'NOT_JOINED' as const, pickup };
      }

      await tx
        .update(schema.socialPickupParticipants)
        .set({ status: 'WITHDRAWN' })
        .where(eq(schema.socialPickupParticipants.id, existing.id));

      const count = Math.max(await this.countJoinedParticipants(id, tx), 1);
      const [updated] = await tx
        .update(schema.socialPickupSessions)
        .set({ currentSlots: count, status: 'OPEN', updatedAt: new Date() })
        .where(eq(schema.socialPickupSessions.id, id))
        .returning();

      return { kind: 'WITHDRAWN' as const, pickup: updated ?? pickup };
    });
  }

  async listPendingRequests(pickupId: string) {
    return this.db
      .select({
        id: schema.socialPickupParticipants.id,
        userId: schema.socialPickupParticipants.userId,
        name: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
        note: schema.socialPickupParticipants.note,
        createdAt: schema.socialPickupParticipants.joinedAt,
      })
      .from(schema.socialPickupParticipants)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.socialPickupParticipants.userId))
      .where(
        and(
          eq(schema.socialPickupParticipants.pickupId, pickupId),
          eq(schema.socialPickupParticipants.status, 'PENDING'),
        ),
      )
      .orderBy(asc(schema.socialPickupParticipants.joinedAt));
  }

  async requestToJoinPickup(id: string, userId: string, note?: string) {
    return this.db.transaction(async (tx) => {
      const pickup = await this.findPickupForUpdate(id, tx);
      if (!pickup) return { kind: 'NOT_FOUND' as const };
      if (pickup.status === 'CANCELLED' || pickup.status === 'COMPLETED' || pickup.status === 'IN_PROGRESS') {
        return { kind: 'TERMINAL' as const, pickup };
      }
      if (pickup.hostUserId === userId) {
        return { kind: 'HOST_CANNOT_REQUEST' as const, pickup };
      }

      const existing = await this.findParticipant(id, userId, tx);
      if (existing?.status === 'JOINED') {
        return { kind: 'ALREADY_JOINED' as const, pickup, participant: existing };
      }

      const count = await this.countJoinedParticipants(id, tx);
      if (count >= pickup.maxSlots) {
        return { kind: 'FULL' as const, pickup };
      }

      const participant = existing
        ? (await tx
            .update(schema.socialPickupParticipants)
            .set({ status: 'PENDING', note: note?.trim() || null, joinedAt: new Date() })
            .where(eq(schema.socialPickupParticipants.id, existing.id))
            .returning())[0]
        : (await tx
            .insert(schema.socialPickupParticipants)
            .values({ pickupId: id, userId, role: 'PLAYER', status: 'PENDING', note: note?.trim() || null })
            .returning())[0];

      return { kind: 'REQUESTED' as const, pickup, participant };
    });
  }

  async approveParticipant(pickupId: string, participantId: string, hostUserId: string) {
    return this.db.transaction(async (tx) => {
      const pickup = await this.findPickupForUpdate(pickupId, tx);
      if (!pickup) return { kind: 'NOT_FOUND' as const };
      if (pickup.hostUserId !== hostUserId) return { kind: 'FORBIDDEN' as const };
      if (pickup.status === 'CANCELLED' || pickup.status === 'COMPLETED' || pickup.status === 'IN_PROGRESS') {
        return { kind: 'TERMINAL' as const, pickup };
      }

      const [participant] = await tx
        .select()
        .from(schema.socialPickupParticipants)
        .where(
          and(
            eq(schema.socialPickupParticipants.id, participantId),
            eq(schema.socialPickupParticipants.pickupId, pickupId),
          ),
        )
        .limit(1);

      if (!participant) return { kind: 'PARTICIPANT_NOT_FOUND' as const };
      if (participant.status === 'JOINED') return { kind: 'ALREADY_JOINED' as const };

      const count = await this.countJoinedParticipants(pickupId, tx);
      if (count >= pickup.maxSlots) {
        if (pickup.status !== 'FULL') {
          await tx
            .update(schema.socialPickupSessions)
            .set({ status: 'FULL', currentSlots: count, updatedAt: new Date() })
            .where(eq(schema.socialPickupSessions.id, pickupId));
        }
        return { kind: 'FULL' as const, pickup };
      }

      const [updatedParticipant] = await tx
        .update(schema.socialPickupParticipants)
        .set({ status: 'JOINED', joinedAt: new Date() })
        .where(eq(schema.socialPickupParticipants.id, participantId))
        .returning();

      const nextCount = count + 1;
      const [updatedPickup] = await tx
        .update(schema.socialPickupSessions)
        .set({
          currentSlots: nextCount,
          status: nextCount >= pickup.maxSlots ? 'FULL' : 'OPEN',
          updatedAt: new Date(),
        })
        .where(eq(schema.socialPickupSessions.id, pickupId))
        .returning();

      return { kind: 'APPROVED' as const, pickup: updatedPickup ?? pickup, participant: updatedParticipant };
    });
  }

  async rejectParticipant(pickupId: string, participantId: string, hostUserId: string) {
    return this.db.transaction(async (tx) => {
      const pickup = await this.findPickupForUpdate(pickupId, tx);
      if (!pickup) return { kind: 'NOT_FOUND' as const };
      if (pickup.hostUserId !== hostUserId) return { kind: 'FORBIDDEN' as const };

      const [participant] = await tx
        .select()
        .from(schema.socialPickupParticipants)
        .where(
          and(
            eq(schema.socialPickupParticipants.id, participantId),
            eq(schema.socialPickupParticipants.pickupId, pickupId),
          ),
        )
        .limit(1);

      if (!participant) return { kind: 'PARTICIPANT_NOT_FOUND' as const };

      const [updatedParticipant] = await tx
        .update(schema.socialPickupParticipants)
        .set({ status: 'REJECTED' })
        .where(eq(schema.socialPickupParticipants.id, participantId))
        .returning();

      return { kind: 'REJECTED' as const, pickup, participant: updatedParticipant };
    });
  }

  async withdrawRequest(pickupId: string, userId: string) {
    return this.db.transaction(async (tx) => {
      const pickup = await this.findPickupForUpdate(pickupId, tx);
      if (!pickup) return { kind: 'NOT_FOUND' as const };

      const existing = await this.findParticipant(pickupId, userId, tx);
      if (!existing || (existing.status !== 'PENDING' && existing.status !== 'JOINED')) {
        return { kind: 'NOT_REQUESTED' as const, pickup };
      }

      const wasJoined = existing.status === 'JOINED';
      await tx
        .update(schema.socialPickupParticipants)
        .set({ status: 'WITHDRAWN' })
        .where(eq(schema.socialPickupParticipants.id, existing.id));

      if (wasJoined) {
        const count = Math.max(await this.countJoinedParticipants(pickupId, tx), 1);
        const [updated] = await tx
          .update(schema.socialPickupSessions)
          .set({ currentSlots: count, status: 'OPEN', updatedAt: new Date() })
          .where(eq(schema.socialPickupSessions.id, pickupId))
          .returning();
        return { kind: 'WITHDRAWN' as const, pickup: updated ?? pickup };
      }

      return { kind: 'WITHDRAWN' as const, pickup };
    });
  }

  async cancelPickup(id: string, hostUserId: string) {
    const [updated] = await this.db
      .update(schema.socialPickupSessions)
      .set({ status: 'CANCELLED', deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(schema.socialPickupSessions.id, id),
          eq(schema.socialPickupSessions.hostUserId, hostUserId),
          isNull(schema.socialPickupSessions.deletedAt),
          isNull(schema.socialPickupSessions.communityId),
          inArray(schema.socialPickupSessions.status, ['OPEN', 'FULL']),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async getProjection(id: string, viewerId?: string): Promise<SocialPickupProjection | null> {
    const [row] = await this.db
      .select({
        pickup: schema.socialPickupSessions,
        host: {
          id: schema.users.id,
          name: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
        category: {
          id: schema.categories.id,
          name: schema.categories.name,
          slug: schema.categories.slug,
        },
      })
      .from(schema.socialPickupSessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.socialPickupSessions.hostUserId))
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.socialPickupSessions.hostUserId))
      .innerJoin(schema.categories, eq(schema.categories.id, schema.socialPickupSessions.categoryId))
      .where(
        and(
          eq(schema.socialPickupSessions.id, id),
          isNull(schema.socialPickupSessions.deletedAt),
          isNull(schema.socialPickupSessions.communityId),
        ),
      )
      .limit(1);
    if (!row) return null;

    const participants = await this.db
      .select({
        userId: schema.socialPickupParticipants.userId,
        name: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.socialPickupParticipants)
      .leftJoin(schema.profiles, eq(schema.profiles.userId, schema.socialPickupParticipants.userId))
      .where(
        and(
          eq(schema.socialPickupParticipants.pickupId, id),
          eq(schema.socialPickupParticipants.status, 'JOINED'),
        ),
      )
      .orderBy(asc(schema.socialPickupParticipants.joinedAt));

    let myStatus: 'JOINED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN' | null = null;
    if (viewerId) {
      const [myPart] = await this.db
        .select({ status: schema.socialPickupParticipants.status })
        .from(schema.socialPickupParticipants)
        .where(
          and(
            eq(schema.socialPickupParticipants.pickupId, id),
            eq(schema.socialPickupParticipants.userId, viewerId),
          ),
        )
        .limit(1);
      myStatus = (myPart?.status as 'JOINED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN') ?? null;
    }

    let pendingRequests: Array<{
      id: string;
      userId: string;
      name: string | null;
      avatarUrl: string | null;
      note: string | null;
      createdAt: Date;
    }> = [];

    if (viewerId && viewerId === row.host.id) {
      pendingRequests = await this.listPendingRequests(id);
    }

    return {
      ...row,
      participantCount: participants.length,
      participants,
      isJoined: myStatus === 'JOINED',
      myStatus,
      pendingRequests,
    };
  }

  async list(input: { date?: string; categoryId?: string; region?: LocationRegion; limit: number; cursor?: string; viewerId?: string }) {
    const cursor = input.cursor
      ? CursorPaginationHelper.decodeCursor<CursorValue>(input.cursor)
      : null;
    if (input.cursor && (!cursor?.id || !cursor.createdAt)) return { invalidCursor: true as const };

    const conditions = [
      isNull(schema.socialPickupSessions.deletedAt),
      isNull(schema.socialPickupSessions.communityId),
      inArray(schema.socialPickupSessions.status, ['OPEN']),
      gte(schema.socialPickupSessions.playDate, sql`(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`),
    ];
    if (input.date) conditions.push(eq(schema.socialPickupSessions.playDate, input.date));
    if (input.categoryId) conditions.push(eq(schema.socialPickupSessions.categoryId, input.categoryId));
    if (input.region) {
      const pickupLocationText = sql<string>`COALESCE(${schema.tournamentVenues.locationAddress}, ${schema.socialPickupSessions.courtLocation})`;
      const pickupProvinceCode = sql<string>`${schema.socialPickupSessions.metadata}->'location'->>'provinceCode'`;
      conditions.push(locationRegionCondition(input.region, {
        provinceCode: pickupProvinceCode,
        locationText: pickupLocationText,
      }));
    }
    if (cursor) {
      conditions.push(
        or(
          lt(schema.socialPickupSessions.createdAt, new Date(cursor.createdAt)),
          and(
            eq(schema.socialPickupSessions.createdAt, new Date(cursor.createdAt)),
            lt(schema.socialPickupSessions.id, cursor.id),
          ),
        )!,
      );
    }

    const rows = await this.db
      .select({ id: schema.socialPickupSessions.id, createdAt: schema.socialPickupSessions.createdAt })
      .from(schema.socialPickupSessions)
      .leftJoin(schema.tournamentVenues, eq(schema.tournamentVenues.id, schema.socialPickupSessions.venueId))
      .where(and(...conditions))
      .orderBy(desc(schema.socialPickupSessions.createdAt), desc(schema.socialPickupSessions.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    const data = (await Promise.all(items.map((row) => this.getProjection(row.id, input.viewerId)))).filter(
      (item): item is SocialPickupProjection => Boolean(item),
    );
    const last = items.at(-1);
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

  async listMine(userId: string) {
    const rows = await this.db
      .select({ id: schema.socialPickupSessions.id })
      .from(schema.socialPickupSessions)
      .where(
        and(
          eq(schema.socialPickupSessions.hostUserId, userId),
          isNull(schema.socialPickupSessions.deletedAt),
          isNull(schema.socialPickupSessions.communityId),
        ),
      )
      .orderBy(desc(schema.socialPickupSessions.createdAt));
    return Promise.all(rows.map((row) => this.getProjection(row.id, userId)));
  }
}
