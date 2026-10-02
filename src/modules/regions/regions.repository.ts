import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import type { AppDbOrTx } from '../../database/db.types';
import { and, asc, eq, ilike, or, SQL } from 'drizzle-orm';
import {
  QueryCentroidDto,
  QueryRegionDto,
  QueryResolveDto,
  QueryWardDto,
  ResolvedRegionDto,
  SearchRegionsDto,
} from './dto/query-region.dto';

export interface RegionSearchItem {
  type: 'province' | 'ward';
  code: string;
  name: string;
  provinceCode: string | null;
  provinceName: string | null;
  displayAddress: string;
}

function clampLimit(raw: number | undefined, fallback: number): number {
  if (raw == null || !Number.isFinite(raw)) return fallback;
  return Math.min(50, Math.max(1, Math.trunc(raw)));
}

function likePattern(search: string): string {
  return `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
}
import { geoPoint } from '../../common/utils/geo-point';

/**
 * Hình dạng trả về chỉ được định nghĩa một lần, ở `ResolvedRegionDto`, để
 * Swagger mô tả đúng thứ client nhận. Ở đây giữ lại tên cũ cho các chữ ký
 * bên dưới.
 *
 * `isEstimated` is true only for a DB center returned as a reference origin;
 * point resolution is polygon-only and returns null when no polygon covers it.
 */
export type ResolvedRegion = ResolvedRegionDto;

@Injectable()
export class RegionsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async findProvinces(query: QueryRegionDto) {
    let conditions: SQL | undefined = undefined;
    const keyword = query.search?.trim();
    if (keyword) {
      const pattern = likePattern(keyword);
      conditions = or(
        ilike(schema.provinces.name, pattern),
        ilike(schema.provinces.fullName, pattern),
      );
    }
    return this.db
      .select()
      .from(schema.provinces)
      .where(conditions)
      .orderBy(
        asc(schema.provinces.fullName),
        asc(schema.provinces.name),
        asc(schema.provinces.code),
      )
      .limit(clampLimit(query.limit, 500));
  }

  async findWards(query: QueryWardDto) {
    const filters: SQL[] = [];

    // Bỏ qua provinceCode rỗng để cho phép tìm ward toàn quốc theo ?search.
    const provinceCode = query.provinceCode?.trim();
    if (provinceCode) {
      filters.push(eq(schema.wards.provinceCode, provinceCode));
    }

    const keyword = query.search?.trim();
    if (keyword) {
      const pattern = likePattern(keyword);
      filters.push(
        or(
          ilike(schema.wards.name, pattern),
          ilike(schema.wards.fullName, pattern),
        ) as SQL,
      );
    }

    const conditions =
      filters.length > 1 ? and(...filters) : filters[0];

    return this.db
      .select({
        code: schema.wards.code,
        name: schema.wards.name,
        nameEn: schema.wards.nameEn,
        fullName: schema.wards.fullName,
        fullNameEn: schema.wards.fullNameEn,
        codeName: schema.wards.codeName,
        provinceCode: schema.wards.provinceCode,
        centerLat: schema.wards.centerLat,
        centerLng: schema.wards.centerLng,
      })
      .from(schema.wards)
      .where(conditions)
      .orderBy(
        asc(schema.wards.fullName),
        asc(schema.wards.name),
        asc(schema.wards.code),
      )
      .limit(clampLimit(query.limit, 500));
  }

  async searchCombined(query: SearchRegionsDto): Promise<RegionSearchItem[]> {
    const keyword = query.q?.trim() ?? '';
    const limit = clampLimit(query.limit, 10);
    if (!keyword) return [];

    const pattern = likePattern(keyword);
    const provinceLimit = Math.max(1, Math.min(10, Math.ceil(limit / 2)));
    const wardLimit = limit;

    const provinces = await this.db
      .select({
        code: schema.provinces.code,
        name: schema.provinces.name,
      })
      .from(schema.provinces)
      .where(
        or(
          ilike(schema.provinces.name, pattern),
          ilike(schema.provinces.fullName, pattern),
        ),
      )
      .orderBy(asc(schema.provinces.name))
      .limit(provinceLimit);

    const wards = await this.db
      .select({
        code: schema.wards.code,
        name: schema.wards.name,
        provinceCode: schema.wards.provinceCode,
        provinceName: schema.provinces.name,
      })
      .from(schema.wards)
      .innerJoin(
        schema.provinces,
        eq(schema.wards.provinceCode, schema.provinces.code),
      )
      .where(
        or(ilike(schema.wards.name, pattern), ilike(schema.wards.fullName, pattern)),
      )
      .orderBy(asc(schema.wards.name))
      .limit(wardLimit);

    const items: RegionSearchItem[] = [
      ...wards.map(
        (w): RegionSearchItem => ({
          type: 'ward',
          code: w.code,
          name: w.name,
          provinceCode: w.provinceCode,
          provinceName: w.provinceName,
          displayAddress: w.provinceName
            ? `${w.name}, ${w.provinceName}`
            : w.name,
        }),
      ),
      ...provinces.map(
        (p): RegionSearchItem => ({
          type: 'province',
          code: p.code,
          name: p.name,
          provinceCode: p.code,
          provinceName: p.name,
          displayAddress: p.name,
        }),
      ),
    ];
    return items.slice(0, limit);
  }
  /** Resolve only from a stored polygon; uncovered points have no inferred region. */
  async resolveByPoint(query: QueryResolveDto, executor: AppDbOrTx = this.db): Promise<ResolvedRegion | null> {
    const point = geoPoint(query.lng, query.lat);
    const rows = await executor.execute(sql`
      SELECT
        w.code AS "wardCode",
        w.name AS "wardName",
        p.code AS "provinceCode",
        p.name AS "provinceName",
        w.center_lat AS "centerLat",
        w.center_lng AS "centerLng"
      FROM wards w
      JOIN provinces p ON p.code = w.province_code
      WHERE ST_Covers(
        w.boundary,
        ${point}
      )
      ORDER BY w.code ASC
      LIMIT 1
    `);
    const covered = (rows as unknown as Omit<ResolvedRegion, 'isEstimated'>[])[0];
    if (covered) {
      return {
        ...covered,
        isEstimated: false,
      };
    }
    return null;
  }

  /** Returns a nullable DB center as an estimated search origin, never as a venue pin. */
  async findCentroid(query: QueryCentroidDto): Promise<ResolvedRegion | null> {
    const [ward] = await this.db.select({
      wardCode: schema.wards.code,
      wardName: schema.wards.name,
      provinceCode: schema.provinces.code,
      provinceName: schema.provinces.name,
      centerLat: schema.wards.centerLat,
      centerLng: schema.wards.centerLng,
    }).from(schema.wards).innerJoin(
      schema.provinces,
      eq(schema.wards.provinceCode, schema.provinces.code),
    ).where(and(
      eq(schema.wards.code, query.wardCode),
      eq(schema.wards.provinceCode, query.provinceCode),
    )).limit(1);
    if (!ward || ward.centerLat == null || ward.centerLng == null
      || !Number.isFinite(ward.centerLat) || !Number.isFinite(ward.centerLng)) return null;
    return {
      ...ward,
      isEstimated: true,
    };
  }
}
