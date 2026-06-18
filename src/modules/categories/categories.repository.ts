import { Injectable, Inject } from '@nestjs/common';
import type { AppDb } from '../../database/db.types';
import { eq, ilike, or } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { QueryCategoryDto } from './dto/query-category.dto';

@Injectable()
export class CategoriesRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  // --- CATEGORY QUERIES ---

  async findAllCategories(query: QueryCategoryDto) {
    let whereClause: ReturnType<typeof or> | undefined = undefined;
    if (query.search) {
      whereClause = or(
        ilike(schema.categories.name, `%${query.search}%`),
        ilike(schema.categories.slug, `%${query.search}%`),
      );
    }

    return await this.db.select().from(schema.categories).where(whereClause);
  }

  async findCategoryById(id: string) {
    const categories = await this.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, id))
      .limit(1);
    return categories[0];
  }

  async findCategoryBySlug(slug: string) {
    const categories = await this.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.slug, slug))
      .limit(1);
    return categories[0];
  }

  async createCategory(data: typeof schema.categories.$inferInsert) {
    const [category] = await this.db
      .insert(schema.categories)
      .values(data)
      .returning();
    return category;
  }

  async updateCategory(
    id: string,
    data: Partial<typeof schema.categories.$inferInsert>,
  ) {
    const [category] = await this.db
      .update(schema.categories)
      .set(data)
      .where(eq(schema.categories.id, id))
      .returning();
    return category;
  }

  async deleteCategory(id: string) {
    const [category] = await this.db
      .delete(schema.categories)
      .where(eq(schema.categories.id, id))
      .returning();
    return category;
  }

  // --- ELO TIER QUERIES ---

  async findEloTiersByCategory(categoryId: string) {
    return await this.db
      .select()
      .from(schema.eloTiers)
      .where(eq(schema.eloTiers.categoryId, categoryId));
  }

  async findEloTierById(id: string) {
    const tiers = await this.db
      .select()
      .from(schema.eloTiers)
      .where(eq(schema.eloTiers.id, id))
      .limit(1);
    return tiers[0];
  }

  async createEloTier(data: typeof schema.eloTiers.$inferInsert) {
    const [tier] = await this.db
      .insert(schema.eloTiers)
      .values(data)
      .returning();
    return tier;
  }

  async updateEloTier(
    id: string,
    data: Partial<typeof schema.eloTiers.$inferInsert>,
  ) {
    const [tier] = await this.db
      .update(schema.eloTiers)
      .set(data)
      .where(eq(schema.eloTiers.id, id))
      .returning();
    return tier;
  }

  async deleteEloTier(id: string) {
    const [tier] = await this.db
      .delete(schema.eloTiers)
      .where(eq(schema.eloTiers.id, id))
      .returning();
    return tier;
  }
}


