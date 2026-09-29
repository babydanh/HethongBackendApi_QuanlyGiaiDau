import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { and, asc, eq, ilike, or, SQL } from 'drizzle-orm';
import {
  QueryCentroidDto,
  QueryRegionDto,
  QueryResolveDto,
  QueryWardDto,
} from './dto/query-region.dto';

export type ResolvedRegion = {
  wardCode: string;
  wardName: string;
  centerLat: number | null;
  centerLng: number | null;
  provinceCode: string;
  provinceName: string;
};

@Injectable()
export class RegionsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async findProvinces(query: QueryRegionDto) {
    let conditions: SQL | undefined = undefined;
    if (query.search) {
      conditions = or(
        ilike(schema.provinces.name, `%${query.search}%`),
        ilike(schema.provinces.fullName, `%${query.search}%`)
      );
    }
    return this.db
      .select()
      .from(schema.provinces)
      .where(conditions)
      .orderBy(asc(schema.provinces.fullName), asc(schema.provinces.name), asc(schema.provinces.code));
  }

  async findWards(query: QueryWardDto) {
    let conditions: SQL | undefined = undefined;
    const filters: SQL[] = [];

    if (query.provinceCode) {
      filters.push(eq(schema.wards.provinceCode, query.provinceCode));
    }
    
    if (query.search) {
      filters.push(
        or(
          ilike(schema.wards.name, `%${query.search}%`),
          ilike(schema.wards.fullName, `%${query.search}%`)
        ) as SQL
      );
    }
    
    conditions = filters.length > 1 ? and(...filters) : filters[0];

    return this.db
      .select()
      .from(schema.wards)
      .where(conditions)
      .orderBy(asc(schema.wards.fullName), asc(schema.wards.name), asc(schema.wards.code));
  }
  /**
   * Chiều ghim → địa chỉ: phường chứa điểm toạ độ.
   *
   * `::geography` là bắt buộc, không phải để đẹp: `wards.boundary` khai
   * geography(MultiPolygon,4326) nên điểm tham chiếu cũng phải là geography —
   * PostGIS sẽ phát sinh lỗi "geography != geometry" nếu để là geometry thuần.
   *
   * PostGIS 3.3 KHÔNG có overload ST_Contains(geography, geography): query viết
   * bằng hàm đó hỏng ngay lúc parse (42883), nên mọi điểm — kể cả điểm ngoài
   * mọi phường — đều trả HTTP 500 chứ không phải null. ST_Covers là vị từ
   * geography-native thay thế: chứa-hằm, nên pin rơi đúng trên cạnh phường vẫn
   * ra phường đó thay vì rơi xuống null.
   *
   * Trả null khi điểm không nằm trong phường nào (kể cả khi boundary NULL):
   * ST_Covers(NULL, ...) là NULL, không phải lỗi.
   */
  async resolveByPoint(query: QueryResolveDto): Promise<ResolvedRegion | null> {
    const rows = await this.db.execute(sql`
      SELECT
        w.code AS "wardCode",
        w.name AS "wardName",
        w.center_lat AS "centerLat",
        w.center_lng AS "centerLng",
        p.code AS "provinceCode",
        p.name AS "provinceName"
      FROM wards w
      JOIN provinces p ON p.code = w.province_code
      WHERE ST_Covers(
        w.boundary,
        ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography
      )
      LIMIT 1
    `);
    return (rows as unknown as ResolvedRegion[])[0] ?? null;
  }

  /** Chiều địa chỉ → ghim: tâm hình học của phường đã biết. */
  async findCentroid(query: QueryCentroidDto): Promise<ResolvedRegion | null> {
    const rows = await this.db.execute(sql`
      SELECT
        w.code AS "wardCode",
        w.name AS "wardName",
        w.center_lat AS "centerLat",
        w.center_lng AS "centerLng",
        p.code AS "provinceCode",
        p.name AS "provinceName"
      FROM wards w
      JOIN provinces p ON p.code = w.province_code
      WHERE w.code = ${query.wardCode}
        AND w.province_code = ${query.provinceCode}
      LIMIT 1
    `);
    return (rows as unknown as ResolvedRegion[])[0] ?? null;
  }
}
