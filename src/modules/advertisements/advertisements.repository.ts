import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import type { Advertisement, NewAdvertisement } from '../../database/schema/advertisements.schema';
import { QueryAdvertisementDto } from './dto/query-advertisement.dto';

@Injectable()
export class AdvertisementsRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  async create(data: NewAdvertisement): Promise<Advertisement> {
    const [ad] = await this.db
      .insert(schema.advertisements)
      .values(data)
      .returning();
    return ad;
  }

    async findById(id: string): Promise<Advertisement | null> {
    const [ad] = await this.db
      .select()
      .from(schema.advertisements)
      .where(eq(schema.advertisements.id, id))
      .limit(1);
    return ad ?? null;
  }

  async findCategoryById(categoryId: string) {
    const [category] = await this.db
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(eq(schema.categories.id, categoryId))
      .limit(1);
    return category ?? null;
  }

  async update(id: string, data: Partial<NewAdvertisement>): Promise<Advertisement | null> {
    const [ad] = await this.db
      .update(schema.advertisements)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.advertisements.id, id))
      .returning();
    return ad ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .delete(schema.advertisements)
      .where(eq(schema.advertisements.id, id))
      .returning({ id: schema.advertisements.id });
    return result.length > 0;
  }

  async incrementViews(id: string): Promise<void> {
    await this.db
      .update(schema.advertisements)
      .set({ viewsCount: sql`${schema.advertisements.viewsCount} + 1` })
      .where(eq(schema.advertisements.id, id));
  }

  async incrementClicks(id: string): Promise<void> {
    await this.db
      .update(schema.advertisements)
      .set({ clicksCount: sql`${schema.advertisements.clicksCount} + 1` })
      .where(eq(schema.advertisements.id, id));
  }

  async findActiveBySlot(
    placementSlot: string,
    categoryId?: string,
    now = new Date(),
  ): Promise<Advertisement[]> {
    const targetCondition = categoryId
      ? or(isNull(schema.advertisements.categoryId), eq(schema.advertisements.categoryId, categoryId))
      : isNull(schema.advertisements.categoryId);

    return this.db
      .select()
      .from(schema.advertisements)
      .where(
        and(
          eq(schema.advertisements.placementSlot, placementSlot),
          eq(schema.advertisements.isActive, true),
          targetCondition,
          or(isNull(schema.advertisements.startDate), lte(schema.advertisements.startDate, now)),
          or(isNull(schema.advertisements.endDate), gte(schema.advertisements.endDate, now)),
        ),
      )
      .orderBy(asc(schema.advertisements.displayOrder), desc(schema.advertisements.createdAt));
  }

  async findAll(query: QueryAdvertisementDto): Promise<{ items: Advertisement[]; total: number; page: number; limit: number; totalPages: number }> {
    const { placementSlot, isActive, search, categoryId, page, limit } = query;
    const conditions: SQL[] = [];

    if (placementSlot) {
      conditions.push(eq(schema.advertisements.placementSlot, placementSlot));
    }
    if (typeof isActive === 'boolean') {
      conditions.push(eq(schema.advertisements.isActive, isActive));
    }
    if (categoryId) {
      conditions.push(eq(schema.advertisements.categoryId, categoryId));
    }
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      const searchCondition = or(
        ilike(schema.advertisements.title, searchPattern),
        ilike(schema.advertisements.description, searchPattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ totalCount: count() })
      .from(schema.advertisements)
      .where(whereClause);

    const totalCount = countResult?.totalCount ?? 0;
    const offset = (page - 1) * limit;

    const items = await this.db
      .select()
      .from(schema.advertisements)
      .where(whereClause)
      .orderBy(asc(schema.advertisements.displayOrder), desc(schema.advertisements.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1,
    };
  }
}
