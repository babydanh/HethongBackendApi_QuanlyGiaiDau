import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { QueryCategoryDto } from './dto/query-category.dto';
export declare class CategoriesRepository {
    private readonly db;
    constructor(db: AppDb);
    findAllCategories(query: QueryCategoryDto): Promise<{
        isActive: boolean;
        id: string;
        name: string;
        slug: string;
        description: string | null;
        categoryConfig: unknown;
    }[]>;
    findCategoryById(id: string): Promise<{
        isActive: boolean;
        id: string;
        name: string;
        slug: string;
        description: string | null;
        categoryConfig: unknown;
    } | null>;
    findCategoryBySlug(slug: string): Promise<{
        isActive: boolean;
        id: string;
        name: string;
        slug: string;
        description: string | null;
        categoryConfig: unknown;
    } | null>;
    createCategory(data: typeof schema.categories.$inferInsert): Promise<{
        id: string;
        name: string;
        description: string | null;
        slug: string;
        categoryConfig: unknown;
    }>;
    updateCategory(id: string, data: Partial<typeof schema.categories.$inferInsert> & {
        isActive?: boolean;
    }): Promise<{
        isActive: boolean;
        id: string;
        name: string;
        slug: string;
        description: string | null;
        categoryConfig: unknown;
    }>;
    deleteCategory(id: string): Promise<{
        id: string;
        name: string;
        description: string | null;
        slug: string;
        categoryConfig: unknown;
    }>;
    findEloTiersByCategory(categoryId: string): Promise<{
        id: string;
        categoryId: string;
        name: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }[]>;
    findEloTierById(id: string): Promise<{
        id: string;
        categoryId: string;
        name: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }>;
    createEloTier(data: typeof schema.eloTiers.$inferInsert): Promise<{
        id: string;
        name: string;
        categoryId: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }>;
    updateEloTier(id: string, data: Partial<typeof schema.eloTiers.$inferInsert>): Promise<{
        id: string;
        categoryId: string;
        name: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }>;
    deleteEloTier(id: string): Promise<{
        id: string;
        name: string;
        categoryId: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }>;
}
