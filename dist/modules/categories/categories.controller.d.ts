import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { CreateEloTierDto } from './dto/create-elo-tier.dto';
import { UpdateEloTierDto } from './dto/update-elo-tier.dto';
export declare class CategoriesController {
    private readonly categoriesService;
    constructor(categoriesService: CategoriesService);
    findAll(query: QueryCategoryDto): Promise<any>;
    findAllForAdmin(query: QueryCategoryDto): Promise<any>;
    findOne(id: string): Promise<any>;
    create(createCategoryDto: CreateCategoryDto): Promise<{
        id: string;
        name: string;
        description: string | null;
        slug: string;
        categoryConfig: unknown;
    }>;
    update(id: string, updateCategoryDto: UpdateCategoryDto): Promise<{
        isActive: boolean;
        id: string;
        name: string;
        slug: string;
        description: string | null;
        categoryConfig: unknown;
    }>;
    remove(id: string): Promise<{
        id: string;
        name: string;
        description: string | null;
        slug: string;
        categoryConfig: unknown;
    }>;
    findEloTiers(id: string): Promise<any>;
    createEloTier(id: string, createEloTierDto: CreateEloTierDto): Promise<{
        id: string;
        name: string;
        categoryId: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }>;
    updateEloTier(categoryId: string, tierId: string, updateEloTierDto: UpdateEloTierDto): Promise<{
        id: string;
        categoryId: string;
        name: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }>;
    removeEloTier(categoryId: string, tierId: string): Promise<{
        id: string;
        name: string;
        categoryId: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }>;
}
