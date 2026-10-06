import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { and, asc, count, desc, eq, ilike, or, sql, SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { QueryVenueDto } from './dto/query-venue.dto';
import { CreateVenueCourtDto } from './dto/create-venue-court.dto';
import type { AppDbOrTx, AppTx } from '../../database/db.types';
import { geoPoint, validateCoordinatePair } from '../../common/utils/geo-point';

/** Bán kính coi là "cùng một sân" khi chống trùng. */
const VENUE_DEDUPE_RADIUS_M = 50;

@Injectable()
export class VenuesRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryVenueDto) {
    const { page = 1, limit = 10, cursor, search } = query;

    let conditions: SQL | undefined = undefined;
    if (search) {
      conditions = or(
        ilike(schema.tournamentVenues.name, `%${search}%`),
        ilike(schema.tournamentVenues.locationAddress, `%${search}%`),
      );
    }

    const baseConditions = and(conditions, sql`${schema.tournamentVenues.deletedAt} IS NULL`);
    let whereClause = baseConditions;
    let cursorValue: { createdAt: string; id: string } | null = null;
    if (cursor) {
      try {
        cursorValue = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { createdAt: string; id: string };
      } catch {
        cursorValue = null;
      }
    }
    if (cursorValue) {
      const cursorDate = new Date(cursorValue.createdAt);
      whereClause = and(
        baseConditions,
        sql`(${schema.tournamentVenues.createdAt} < ${cursorDate} OR (${schema.tournamentVenues.createdAt} = ${cursorDate} AND ${schema.tournamentVenues.id} < ${cursorValue.id}))`,
      );
    }

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.tournamentVenues)
      .where(baseConditions);

    let venuesQuery = this.db
      .select({
        id: schema.tournamentVenues.id,
        ownerUserId: schema.tournamentVenues.ownerUserId,
        name: schema.tournamentVenues.name,
        locationAddress: schema.tournamentVenues.locationAddress,
        locationGeolocation: schema.tournamentVenues.locationGeolocation,
        imagesUrls: schema.tournamentVenues.imagesUrls,
        createdAt: schema.tournamentVenues.createdAt,
        deletedAt: schema.tournamentVenues.deletedAt,
        latitude: sql<number | null>`ST_Y(${schema.tournamentVenues.locationGeolocation}::geometry)`,
        longitude: sql<number | null>`ST_X(${schema.tournamentVenues.locationGeolocation}::geometry)`,
      })
      .from(schema.tournamentVenues)
      .where(whereClause)
      .orderBy(desc(schema.tournamentVenues.createdAt), desc(schema.tournamentVenues.id))
      .limit(limit + 1)
      .$dynamic();
    const rows = await venuesQuery;
    const hasMore = rows.length > limit;
    const venues = (hasMore ? rows.slice(0, limit) : rows);
    const lastVenue = venues.at(-1);
    const nextCursor = hasMore && lastVenue
      ? Buffer.from(JSON.stringify({ createdAt: lastVenue.createdAt.toISOString(), id: lastVenue.id })).toString('base64url')
      : null;

    return {
      data: venues,
      meta: {
        total: totalRecord.count,
        page,
        limit,
        totalPages: Math.ceil(totalRecord.count / limit),
        nextCursor,
        hasMore,
      },
    };
  }

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(schema.tournamentVenues)
      .where(eq(schema.tournamentVenues.id, id))
      .limit(1);

    if (result.length === 0) return null;
    return result[0];
  }

  async findByIdWithCoordinates(id: string) {
    const [row] = await this.db.select({
      id: schema.tournamentVenues.id,
      ownerUserId: schema.tournamentVenues.ownerUserId,
      name: schema.tournamentVenues.name,
      locationAddress: schema.tournamentVenues.locationAddress,
      locationGeolocation: schema.tournamentVenues.locationGeolocation,
      imagesUrls: schema.tournamentVenues.imagesUrls,
      createdAt: schema.tournamentVenues.createdAt,
      deletedAt: schema.tournamentVenues.deletedAt,
      latitude: sql<number | null>`ST_Y(${schema.tournamentVenues.locationGeolocation}::geometry)`,
      longitude: sql<number | null>`ST_X(${schema.tournamentVenues.locationGeolocation}::geometry)`,
    }).from(schema.tournamentVenues).where(eq(schema.tournamentVenues.id, id)).limit(1);
    return row ?? null;
  }

  async searchSocialVenues(query: string, limit = 10) {
    const normalized = query.trim();
    const escaped = normalized.replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    return this.db.select({
      venueId: schema.tournamentVenues.id,
      name: schema.tournamentVenues.name,
      formattedAddress: schema.tournamentVenues.locationAddress,
      latitude: sql<number>`ST_Y(${schema.tournamentVenues.locationGeolocation}::geometry)`,
      longitude: sql<number>`ST_X(${schema.tournamentVenues.locationGeolocation}::geometry)`,
      provinceCode: schema.tournamentVenues.provinceCode,
      wardCode: schema.tournamentVenues.wardCode,
      score: sql<number>`similarity(${schema.tournamentVenues.searchText}, public.f_unaccent(lower(${normalized})))`,
    }).from(schema.tournamentVenues).where(and(
      sql`${schema.tournamentVenues.deletedAt} IS NULL`,
      sql`${schema.tournamentVenues.locationGeolocation} IS NOT NULL`,
      sql`(${schema.tournamentVenues.searchText} % public.f_unaccent(lower(${normalized})) OR ${schema.tournamentVenues.searchText} ILIKE ${pattern} ESCAPE E'\\\\')`,
    )).orderBy(desc(sql`similarity(${schema.tournamentVenues.searchText}, public.f_unaccent(lower(${normalized})))`), asc(schema.tournamentVenues.id)).limit(Math.min(10, Math.max(1, limit)));
  }

  async findMatchingPinnedVenues(data: CreateVenueDto, tx: AppDbOrTx = this.db) {
    const pair = validateCoordinatePair(data.latitude, data.longitude, { required: true })!;
    return tx.select({
      id: schema.tournamentVenues.id,
      name: schema.tournamentVenues.name,
      locationAddress: schema.tournamentVenues.locationAddress,
      latitude: sql<number | null>`ST_Y(${schema.tournamentVenues.locationGeolocation}::geometry)`,
      longitude: sql<number | null>`ST_X(${schema.tournamentVenues.locationGeolocation}::geometry)`,
      distanceMeters: sql<number>`ST_Distance(${schema.tournamentVenues.locationGeolocation}, ${geoPoint(pair.longitude, pair.latitude)})`,
    }).from(schema.tournamentVenues).where(and(
      sql`similarity(public.f_unaccent(lower(${schema.tournamentVenues.name})), public.f_unaccent(lower(${data.name.trim()}))) > 0.5`,
      sql`${schema.tournamentVenues.locationGeolocation} IS NOT NULL`,
      sql`ST_DWithin(${schema.tournamentVenues.locationGeolocation}, ${geoPoint(pair.longitude, pair.latitude)}, ${VENUE_DEDUPE_RADIUS_M})`,
      sql`${schema.tournamentVenues.deletedAt} IS NULL`,
    )).orderBy(asc(sql`ST_Distance(${schema.tournamentVenues.locationGeolocation}, ${geoPoint(pair.longitude, pair.latitude)})`), asc(schema.tournamentVenues.id)).limit(10);
  }

  /**
   * Venue trùng vị trí mà tên khớp TUYỆT ĐỐI sau khi bỏ dấu + hạ chữ thường +
   * cắt khoảng trắng. Khác `findMatchingPinnedVenues` (dùng fuzzy > 0.5) ở chỗ
   * này là điều kiện nhị phân: chỉ khi đúng một venue thoả mới tái dùng được.
   *
   * Lấy tối đa 2 dòng vì trùng cả tên lẫn vị trí thì không dứt khoáng được —
   * đẩy xuống bước dedupe mơ hồ để host chọn.
   */
  async findExactNamedPinnedVenues(
    data: CreateVenueDto,
    tx: AppDbOrTx = this.db,
  ) {
    const pair = validateCoordinatePair(data.latitude, data.longitude, { required: true })!;
    return tx.select({
      id: schema.tournamentVenues.id,
      name: schema.tournamentVenues.name,
      locationAddress: schema.tournamentVenues.locationAddress,
      latitude: sql<number | null>`ST_Y(${schema.tournamentVenues.locationGeolocation}::geometry)`,
      longitude: sql<number | null>`ST_X(${schema.tournamentVenues.locationGeolocation}::geometry)`,
      distanceMeters: sql<number>`ST_Distance(${schema.tournamentVenues.locationGeolocation}, ${geoPoint(pair.longitude, pair.latitude)})`,
    }).from(schema.tournamentVenues).where(and(
      sql`public.f_unaccent(lower(btrim(${schema.tournamentVenues.name}))) = public.f_unaccent(lower(btrim(${data.name.trim()})))`,
      sql`${schema.tournamentVenues.locationGeolocation} IS NOT NULL`,
      sql`ST_DWithin(${schema.tournamentVenues.locationGeolocation}, ${geoPoint(pair.longitude, pair.latitude)}, ${VENUE_DEDUPE_RADIUS_M})`,
      sql`${schema.tournamentVenues.deletedAt} IS NULL`,
    )).orderBy(asc(sql`ST_Distance(${schema.tournamentVenues.locationGeolocation}, ${geoPoint(pair.longitude, pair.latitude)})`), asc(schema.tournamentVenues.id)).limit(2);
  }

  /**
   * Tạo venue cho host ghim trong kèo, nhưng tái dùng venue đã có thay vì nhân
   * bản khi trùng rõ ràng. Khác `create`: đường create cố ý trả 409 để bắt
   * host chọn lại venue có sẵn, còn đường update phải idempotent — sửa kèo mà
   * giữ nguyên sân sẽ gặp lại chính venue đó và phải không tạo bản sao.
   */
  async findOrCreateForSocial(
    userId: string,
    data: CreateVenueDto,
    executor: AppDbOrTx | undefined = this.db,
    regionCodes?: { provinceCode: string | null; wardCode: string | null },
  ) {
    const pair = validateCoordinatePair(data.latitude, data.longitude);
    const write = async (tx: AppTx) => {
      if (pair) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(731904, 1)`);
        const exact = await this.findExactNamedPinnedVenues({ ...data, ...pair }, tx);
        if (exact.length === 1) return { record: exact[0] } as const;
        const candidates = await this.findMatchingPinnedVenues({ ...data, ...pair }, tx);
        if (candidates.length) return { duplicateCandidates: candidates } as const;
      }
      return { record: await this.insertVenue(tx, userId, data, pair, regionCodes) } as const;
    };
    const activeExecutor = executor ?? this.db;
    const outcome = activeExecutor === this.db
      ? await this.db.transaction(write)
      : await write(activeExecutor as AppTx);
    return 'record' in outcome ? outcome.record : outcome;
  }

  /** Phần ghi dùng chung cho luồng tạo và luồng sửa. */
  async insertVenue(
    tx: AppTx,
    userId: string,
    data: CreateVenueDto,
    pair: { latitude: number; longitude: number } | null,
    regionCodes?: { provinceCode: string | null; wardCode: string | null },
  ) {
    const [record] = await tx
      .insert(schema.tournamentVenues)
      .values({
        ownerUserId: userId,
        name: data.name,
        locationAddress: data.locationAddress,
        provinceCode: regionCodes?.provinceCode ?? null,
        wardCode: regionCodes?.wardCode ?? null,
        ...(pair && { locationGeolocation: geoPoint(pair.longitude, pair.latitude) }),
        imagesUrls: data.imagesUrls,
      } as typeof schema.tournamentVenues.$inferInsert)
      .returning();

    if (!record) {
      throw new InternalServerErrorException('Venue insert returned no record');
    }

    await this.auditService.logCreate(tx, userId, 'tournament_venues', record.id, record);
    return record;
  }

  /**
   * Đường tạo venue: giữ nguyên hành vi 409 để bắt host chọn lại sân đã có.
   * Cố tình KHÔNG tái dùng theo tên tuyệt đối như `findOrCreateForSocial` —
   * lúc tạo kèo, host ghim trùng sân đang có vẫn nên được nhắc chọn lại.
   */
  async create(
    userId: string,
    data: CreateVenueDto,
    executor: AppDbOrTx | undefined = this.db,
    regionCodes?: { provinceCode: string | null; wardCode: string | null },
  ) {
    const pair = validateCoordinatePair(data.latitude, data.longitude);
    const write = async (tx: AppTx) => {
      if (pair) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(731904, 1)`);
        const candidates = await this.findMatchingPinnedVenues({ ...data, ...pair }, tx);
        if (candidates.length) return { duplicateCandidates: candidates } as const;
      }
      return { record: await this.insertVenue(tx, userId, data, pair, regionCodes) } as const;
    };
    const activeExecutor = executor ?? this.db;
    const outcome = activeExecutor === this.db
      ? await this.db.transaction(write)
      : await write(activeExecutor as AppTx);
    return 'record' in outcome ? outcome.record : outcome;
  }

  async update(id: string, userId: string, data: UpdateVenueDto) {
    const hasLat = data.latitude !== undefined;
    const hasLng = data.longitude !== undefined;
    if (hasLat !== hasLng) validateCoordinatePair(data.latitude, data.longitude, { required: true });
    const pair = hasLat && hasLng ? validateCoordinatePair(data.latitude, data.longitude, { required: true }) : null;

    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx.select().from(schema.tournamentVenues).where(and(eq(schema.tournamentVenues.id, id), eq(schema.tournamentVenues.ownerUserId, userId), sql`${schema.tournamentVenues.deletedAt} IS NULL`)).limit(1);
      if (!oldRecord) return null;

      const [updated] = await tx
        .update(schema.tournamentVenues)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.locationAddress && { locationAddress: data.locationAddress }),
          ...(pair && { locationGeolocation: geoPoint(pair.longitude, pair.latitude) }),
          ...(data.imagesUrls && { imagesUrls: data.imagesUrls }),
        })
        .where(and(eq(schema.tournamentVenues.id, id), eq(schema.tournamentVenues.ownerUserId, userId), sql`${schema.tournamentVenues.deletedAt} IS NULL`))
        .returning();

      if (!updated) return null;
      await this.auditService.logUpdate(tx, userId, 'tournament_venues', id, oldRecord, updated);
      return updated;
    });
  }

  async delete(id: string, userId: string) {
    const [deleted] = await this.db
      .delete(schema.tournamentVenues)
      .where(and(eq(schema.tournamentVenues.id, id), eq(schema.tournamentVenues.ownerUserId, userId), sql`${schema.tournamentVenues.deletedAt} IS NULL`))
      .returning();
    return deleted;
  }

  // --- COURTS ---

  async findCourtsByVenue(venueId: string) {
    return this.db
      .select()
      .from(schema.venueCourts)
      .where(eq(schema.venueCourts.venueId, venueId));
  }

  async addCourt(venueId: string, data: CreateVenueCourtDto) {
    const [court] = await this.db
      .insert(schema.venueCourts)
      .values({
        venueId,
        courtName: data.courtName,
        status: data.status || 'AVAILABLE',
      })
      .returning();
    return court;
  }

  async addCourtsBatch(venueId: string, courtCount: number, namePrefix = 'Sân') {
    const existingCourts = await this.findCourtsByVenue(venueId);
    const existingCount = existingCourts.length;
    const valuesToInsert = Array.from({ length: courtCount }, (_, i) => ({
      venueId,
      courtName: `${namePrefix} ${existingCount + i + 1}`,
      status: 'AVAILABLE',
    }));

    if (valuesToInsert.length === 0) return [];
    return this.db
      .insert(schema.venueCourts)
      .values(valuesToInsert)
      .returning();
  }

  async findCourtByVenue(venueId: string, courtId: string) {
    const [court] = await this.db.select().from(schema.venueCourts).where(and(
      eq(schema.venueCourts.id, courtId),
      eq(schema.venueCourts.venueId, venueId),
    )).limit(1);
    return court ?? null;
  }

  async removeCourt(venueId: string, courtId: string) {
    const [deleted] = await this.db
      .delete(schema.venueCourts)
      .where(and(eq(schema.venueCourts.id, courtId), eq(schema.venueCourts.venueId, venueId)))
      .returning();
    return deleted;
  }
}
