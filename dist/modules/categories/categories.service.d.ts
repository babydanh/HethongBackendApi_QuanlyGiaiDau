import { CategoriesRepository } from './categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { CreateEloTierDto } from './dto/create-elo-tier.dto';
import { UpdateEloTierDto } from './dto/update-elo-tier.dto';
import { RedisService } from '../../providers/redis/redis.service';
export declare class CategoriesService {
    private readonly categoriesRepository;
    private readonly redisService;
    constructor(categoriesRepository: CategoriesRepository, redisService: RedisService);
    findAllCategories(query: QueryCategoryDto): Promise<any>;
    findAllAdminCategories(query?: QueryCategoryDto): Promise<any>;
    findCategoryById(id: string): Promise<any>;
    createCategory(dto: CreateCategoryDto): Promise<{
        id: string;
        name: string;
        description: string | null;
        slug: string;
        categoryConfig: unknown;
    }>;
    updateCategory(id: string, dto: UpdateCategoryDto): Promise<{
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
    findEloTiersByCategory(categoryId: string): Promise<any>;
    createEloTier(categoryId: string, dto: CreateEloTierDto): Promise<{
        id: string;
        name: string;
        categoryId: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }>;
    updateEloTier(tierId: string, dto: UpdateEloTierDto): Promise<{
        id: string;
        categoryId: string;
        name: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }>;
    deleteEloTier(tierId: string): Promise<{
        id: string;
        name: string;
        categoryId: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }>;
}
