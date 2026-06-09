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

@Injectable()
export class CategoriesService {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  // --- CATEGORIES ---

  async findAllCategories(query: QueryCategoryDto) {
    return await this.categoriesRepository.findAllCategories(query);
  }

  async findCategoryById(id: string) {
    const category = await this.categoriesRepository.findCategoryById(id);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async createCategory(dto: CreateCategoryDto) {
    const existingSlug = await this.categoriesRepository.findCategoryBySlug(
      dto.slug,
    );
    if (existingSlug) {
      throw new ConflictException('Category with this slug already exists');
    }

    return await this.categoriesRepository.createCategory(dto);
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.findCategoryById(id); // Ensure exists

    if (dto.slug) {
      const existingSlug = await this.categoriesRepository.findCategoryBySlug(
        dto.slug,
      );
      if (existingSlug && existingSlug.id !== id) {
        throw new ConflictException('Category with this slug already exists');
      }
    }

    return await this.categoriesRepository.updateCategory(id, dto);
  }

  async deleteCategory(id: string) {
    await this.findCategoryById(id); // Ensure exists

    // Note: categories table doesn't have deleted_at in current schema,
    // it's a hard delete. But since other tables reference it restrictively/cascade,
    // we just let DB constraints handle errors if it's in use, or proceed with delete.
    return await this.categoriesRepository.deleteCategory(id);
  }

  // --- ELO TIERS ---

  async findEloTiersByCategory(categoryId: string) {
    await this.findCategoryById(categoryId); // Ensure category exists
    return await this.categoriesRepository.findEloTiersByCategory(categoryId);
  }

  async createEloTier(categoryId: string, dto: CreateEloTierDto) {
    await this.findCategoryById(categoryId); // Ensure category exists

    if (dto.minElo >= dto.maxElo) {
      throw new BadRequestException('minElo must be less than maxElo');
    }

    return await this.categoriesRepository.createEloTier({
      ...dto,
      categoryId,
    });
  }

  async updateEloTier(tierId: string, dto: UpdateEloTierDto) {
    const tier = await this.categoriesRepository.findEloTierById(tierId);
    if (!tier) {
      throw new NotFoundException('Elo tier not found');
    }

    const minElo = dto.minElo ?? tier.minElo;
    const maxElo = dto.maxElo ?? tier.maxElo;

    if (minElo >= maxElo) {
      throw new BadRequestException('minElo must be less than maxElo');
    }

    return await this.categoriesRepository.updateEloTier(tierId, dto);
  }

  async deleteEloTier(tierId: string) {
    const tier = await this.categoriesRepository.findEloTierById(tierId);
    if (!tier) {
      throw new NotFoundException('Elo tier not found');
    }
    return await this.categoriesRepository.deleteEloTier(tierId);
  }
}
