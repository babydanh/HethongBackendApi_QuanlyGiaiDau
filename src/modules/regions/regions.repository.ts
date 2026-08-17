import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, ilike, SQL, or, and } from 'drizzle-orm';
import { QueryRegionDto, QueryDistrictDto, QueryWardDto } from './dto/query-region.dto';

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
    return this.db.select().from(schema.provinces).where(conditions).orderBy(schema.provinces.code);
  }

  async findDistricts(query: QueryDistrictDto) {
    let conditions: SQL | undefined = undefined;
    const filters: SQL[] = [eq(schema.districts.provinceCode, query.provinceCode)];
    
    if (query.search) {
      filters.push(
        or(
          ilike(schema.districts.name, `%${query.search}%`),
          ilike(schema.districts.fullName, `%${query.search}%`)
        ) as SQL
      );
    }
    
    conditions = filters.length > 1 ? and(...filters) : filters[0];
    
    return this.db.select().from(schema.districts).where(conditions).orderBy(schema.districts.code);
  }

  async findWards(query: QueryWardDto) {
    let conditions: SQL | undefined = undefined;
    const filters: SQL[] = [];

    if (query.provinceCode) {
      filters.push(eq(schema.wards.provinceCode, query.provinceCode));
    } else if (query.districtCode) {
      filters.push(eq(schema.wards.districtCode, query.districtCode));
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

    return this.db.select().from(schema.wards).where(conditions).orderBy(schema.wards.name);
  }
}


