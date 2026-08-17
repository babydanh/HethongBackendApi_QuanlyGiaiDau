"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesService = void 0;
const common_1 = require("@nestjs/common");
const categories_repository_1 = require("./categories.repository");
const redis_service_1 = require("../../providers/redis/redis.service");
const CACHE_TTL = 300;
const CACHE_KEY_ALL = 'categories:all';
const CACHE_KEY_ONE = (id) => `categories:${id}`;
const CACHE_KEY_ELO = (id) => `categories:${id}:elo-tiers`;
let CategoriesService = class CategoriesService {
    categoriesRepository;
    redisService;
    constructor(categoriesRepository, redisService) {
        this.categoriesRepository = categoriesRepository;
        this.redisService = redisService;
    }
    async findAllCategories(query) {
        const hasQuery = query && Object.keys(query).length > 0;
        const cacheKey = hasQuery ? `${CACHE_KEY_ALL}:${JSON.stringify(query)}` : CACHE_KEY_ALL;
        const cached = await this.redisService.get(cacheKey);
        if (cached)
            return JSON.parse(cached);
        const result = await this.categoriesRepository.findAllCategories(query);
        await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL);
        return result;
    }
    async findAllAdminCategories(query = {}) {
        const adminQuery = { ...query, includeInactive: true };
        const cacheKey = `${CACHE_KEY_ALL}:admin:${JSON.stringify(adminQuery)}`;
        const cached = await this.redisService.get(cacheKey);
        if (cached)
            return JSON.parse(cached);
        const result = await this.categoriesRepository.findAllCategories(adminQuery);
        await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL);
        return result;
    }
    async findCategoryById(id) {
        const cacheKey = CACHE_KEY_ONE(id);
        const cached = await this.redisService.get(cacheKey);
        if (cached)
            return JSON.parse(cached);
        const category = await this.categoriesRepository.findCategoryById(id);
        if (!category) {
            throw new common_1.NotFoundException('Category not found');
        }
        await this.redisService.set(cacheKey, JSON.stringify(category), CACHE_TTL * 2);
        return category;
    }
    async createCategory(dto) {
        const existingSlug = await this.categoriesRepository.findCategoryBySlug(dto.slug);
        if (existingSlug) {
            throw new common_1.ConflictException('Category with this slug already exists');
        }
        const result = await this.categoriesRepository.createCategory(dto);
        await this.redisService.delByPattern(`${CACHE_KEY_ALL}*`);
        return result;
    }
    async updateCategory(id, dto) {
        await this.findCategoryById(id);
        if (dto.slug) {
            const existingSlug = await this.categoriesRepository.findCategoryBySlug(dto.slug);
            if (existingSlug && existingSlug.id !== id) {
                throw new common_1.ConflictException('Category with this slug already exists');
            }
        }
        const result = await this.categoriesRepository.updateCategory(id, dto);
        await this.redisService.del(CACHE_KEY_ONE(id));
        await this.redisService.delByPattern(`${CACHE_KEY_ALL}*`);
        return result;
    }
    async deleteCategory(id) {
        await this.findCategoryById(id);
        const result = await this.categoriesRepository.deleteCategory(id);
        await this.redisService.del(CACHE_KEY_ONE(id));
        await this.redisService.delByPattern(`${CACHE_KEY_ALL}*`);
        return result;
    }
    async findEloTiersByCategory(categoryId) {
        const cacheKey = CACHE_KEY_ELO(categoryId);
        const cached = await this.redisService.get(cacheKey);
        if (cached)
            return JSON.parse(cached);
        await this.findCategoryById(categoryId);
        const result = await this.categoriesRepository.findEloTiersByCategory(categoryId);
        await this.redisService.set(cacheKey, JSON.stringify(result), CACHE_TTL);
        return result;
    }
    async createEloTier(categoryId, dto) {
        await this.findCategoryById(categoryId);
        if (dto.minElo >= dto.maxElo) {
            throw new common_1.BadRequestException('minElo must be less than maxElo');
        }
        const result = await this.categoriesRepository.createEloTier({ ...dto, categoryId });
        await this.redisService.del(CACHE_KEY_ELO(categoryId));
        return result;
    }
    async updateEloTier(tierId, dto) {
        const tier = await this.categoriesRepository.findEloTierById(tierId);
        if (!tier)
            throw new common_1.NotFoundException('Elo tier not found');
        const minElo = dto.minElo ?? tier.minElo;
        const maxElo = dto.maxElo ?? tier.maxElo;
        if (minElo >= maxElo) {
            throw new common_1.BadRequestException('minElo must be less than maxElo');
        }
        const result = await this.categoriesRepository.updateEloTier(tierId, dto);
        await this.redisService.del(CACHE_KEY_ELO(tier.categoryId));
        return result;
    }
    async deleteEloTier(tierId) {
        const tier = await this.categoriesRepository.findEloTierById(tierId);
        if (!tier)
            throw new common_1.NotFoundException('Elo tier not found');
        const result = await this.categoriesRepository.deleteEloTier(tierId);
        await this.redisService.del(CACHE_KEY_ELO(tier.categoryId));
        return result;
    }
};
exports.CategoriesService = CategoriesService;
exports.CategoriesService = CategoriesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [categories_repository_1.CategoriesRepository,
        redis_service_1.RedisService])
], CategoriesService);
//# sourceMappingURL=categories.service.js.map