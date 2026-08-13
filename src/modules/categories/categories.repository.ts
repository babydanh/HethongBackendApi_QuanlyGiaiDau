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

    const list = await this.db.select().from(schema.categories).where(whereClause);
    const results = list.map((cat) => {
      const config = (cat.categoryConfig as Record<string, unknown>) || {};
      const isActive = config.isActive !== false;
      return {
        ...cat,
        isActive,
      };
    });

    if (query.includeInactive === true || String(query.includeInactive) === 'true') {
      return results;
    }
    return results.filter((cat) => cat.isActive);
  }

  async findCategoryById(id: string) {
    const categories = await this.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.id, id))
      .limit(1);
    if (!categories[0]) return null;
    const cat = categories[0];
    const config = (cat.categoryConfig as Record<string, unknown>) || {};
    return {
      ...cat,
      isActive: config.isActive !== false,
    };
  }

  async findCategoryBySlug(slug: string) {
    const categories = await this.db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.slug, slug))
      .limit(1);
    if (!categories[0]) return null;
    const cat = categories[0];
    const config = (cat.categoryConfig as Record<string, unknown>) || {};
    return {
      ...cat,
      isActive: config.isActive !== false,
    };
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
    data: Partial<typeof schema.categories.$inferInsert> & { isActive?: boolean },
  ) {
    const existing = await this.findCategoryById(id);
    const existingConfig = (existing?.categoryConfig as Record<string, unknown>) || {};
    const updatedConfig = {
      ...existingConfig,
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    };

    const updateData = { ...(data as Record<string, unknown>) };
    delete updateData.isActive;

    const [category] = await this.db
      .update(schema.categories)
      .set({
        ...updateData,
        categoryConfig: updatedConfig,
      })
      .where(eq(schema.categories.id, id))
      .returning();
    
    return {
      ...category,
      isActive: updatedConfig.isActive !== false,
    };
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


