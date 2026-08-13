import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CategoriesRepository } from './categories.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { CreateEloTierDto } from './dto/create-elo-tier.dto';
import { UpdateEloTierDto } from './dto/update-elo-tier.dto';
import { RedisService } from '../../providers/redis/redis.service';

const CACHE_TTL = 300; // 5 phút
const CACHE_KEY_ALL = 'categories:all';
const CACHE_KEY_ONE = (id: string) => `categories:${id}`;
const CACHE_KEY_ELO = (id: string) => `categories:${id}:elo-tiers`;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly redisService: RedisService,
  ) {}

  // --- CATEGORIES ---

  async findAllCategories(query: QueryCategoryDto) {
    const hasQuery = query && Object.keys(query).length > 0;
    const cacheKey = hasQuery ? `${CACHE_KEY_ALL}:${JSON.stringify(query)}` : CACHE_KEY_ALL;
    const cached = await this.redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await this.categoriesRepository.findAllCategories(query);
    await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL);
    return result;
  }

  async findCategoryById(id: string) {
    const cacheKey = CACHE_KEY_ONE(id);
    const cached = await this.redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const category = await this.categoriesRepository.findCategoryById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    await this.redisService.set(cacheKey, JSON.stringify(category), CACHE_TTL * 2);
    return category;
  }

  async createCategory(dto: CreateCategoryDto) {
    const existingSlug = await this.categoriesRepository.findCategoryBySlug(dto.slug);
    if (existingSlug) {
      throw new ConflictException('Category with this slug already exists');
    }
    const result = await this.categoriesRepository.createCategory(dto);
    await this.redisService.delByPattern(`${CACHE_KEY_ALL}*`);
    return result;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.findCategoryById(id);
    if (dto.slug) {
      const existingSlug = await this.categoriesRepository.findCategoryBySlug(dto.slug);
      if (existingSlug && existingSlug.id !== id) {
        throw new ConflictException('Category with this slug already exists');
      }
    }
    const result = await this.categoriesRepository.updateCategory(id, dto);
    await this.redisService.del(CACHE_KEY_ONE(id));
    await this.redisService.delByPattern(`${CACHE_KEY_ALL}*`);
    return result;
  }

  async deleteCategory(id: string) {
    await this.findCategoryById(id);
    const result = await this.categoriesRepository.deleteCategory(id);
    await this.redisService.del(CACHE_KEY_ONE(id));
    await this.redisService.delByPattern(`${CACHE_KEY_ALL}*`);
    return result;
  }

  // --- ELO TIERS ---

  async findEloTiersByCategory(categoryId: string) {
    const cacheKey = CACHE_KEY_ELO(categoryId);
    const cached = await this.redisService.get(cacheKey);
    if (cached) return JSON.parse(cached);

    await this.findCategoryById(categoryId);
    const result = await this.categoriesRepository.findEloTiersByCategory(categoryId);
    await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL);
    return result;
  }

  async createEloTier(categoryId: string, dto: CreateEloTierDto) {
    await this.findCategoryById(categoryId);
    if (dto.minElo >= dto.maxElo) {
      throw new BadRequestException('minElo must be less than maxElo');
    }
    const result = await this.categoriesRepository.createEloTier({ ...dto, categoryId });
    await this.redisService.del(CACHE_KEY_ELO(categoryId));
    return result;
  }

  async updateEloTier(tierId: string, dto: UpdateEloTierDto) {
    const tier = await this.categoriesRepository.findEloTierById(tierId);
    if (!tier) throw new NotFoundException('Elo tier not found');

    const minElo = dto.minElo ?? tier.minElo;
    const maxElo = dto.maxElo ?? tier.maxElo;
    if (minElo >= maxElo) {
      throw new BadRequestException('minElo must be less than maxElo');
    }
    const result = await this.categoriesRepository.updateEloTier(tierId, dto);
    await this.redisService.del(CACHE_KEY_ELO(tier.categoryId));
    return result;
  }

  async deleteEloTier(tierId: string) {
    const tier = await this.categoriesRepository.findEloTierById(tierId);
    if (!tier) throw new NotFoundException('Elo tier not found');

    const result = await this.categoriesRepository.deleteEloTier(tierId);
    await this.redisService.del(CACHE_KEY_ELO(tier.categoryId));
    return result;
  }
}
