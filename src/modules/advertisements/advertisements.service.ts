import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdvertisementsRepository } from './advertisements.repository';
import { CreateAdvertisementDto } from './dto/create-advertisement.dto';
import { QueryAdvertisementDto } from './dto/query-advertisement.dto';
import { UpdateAdvertisementDto } from './dto/update-advertisement.dto';
import type { Advertisement } from '../../database/schema/advertisements.schema';

@Injectable()
export class AdvertisementsService {
  constructor(private readonly repository: AdvertisementsRepository) {}

  async create(dto: CreateAdvertisementDto): Promise<Advertisement> {
    this.validateDates(dto.startDate, dto.endDate);
    await this.validateCategoryId(dto.categoryId);

    const data = {
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      bannerType: dto.bannerType || 'IMAGE_LINK',
      imageUrl: dto.imageUrl?.trim() || null,
      targetUrl: dto.targetUrl?.trim() || null,
      ctaText: dto.ctaText?.trim() || null,
      customHtml: dto.customHtml || null,
      placementSlot: dto.placementSlot,
      categoryId: dto.categoryId ?? null,
      displayOrder: dto.displayOrder ?? 0,
      isActive: dto.isActive ?? true,
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
    };

    return this.repository.create(data);
  }

  async update(id: string, dto: UpdateAdvertisementDto): Promise<Advertisement> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Quảng cáo không tồn tại');
    }

    const startDate = dto.startDate !== undefined ? (dto.startDate ? new Date(dto.startDate) : null) : existing.startDate;
    const endDate = dto.endDate !== undefined ? (dto.endDate ? new Date(dto.endDate) : null) : existing.endDate;
    this.validateDates(startDate?.toISOString(), endDate?.toISOString());

    await this.validateCategoryId(dto.categoryId);

    const updateData: Record<string, unknown> = {};
    if (dto.title !== undefined) updateData.title = dto.title.trim();
    if (dto.description !== undefined) updateData.description = dto.description?.trim() || null;
    if (dto.bannerType !== undefined) updateData.bannerType = dto.bannerType;
    if (dto.imageUrl !== undefined) updateData.imageUrl = dto.imageUrl?.trim() || null;
    if (dto.targetUrl !== undefined) updateData.targetUrl = dto.targetUrl?.trim() || null;
    if (dto.ctaText !== undefined) updateData.ctaText = dto.ctaText?.trim() || null;
    if (dto.customHtml !== undefined) updateData.customHtml = dto.customHtml || null;
    if (dto.placementSlot !== undefined) updateData.placementSlot = dto.placementSlot;
    if (dto.categoryId !== undefined) updateData.categoryId = dto.categoryId || null;
    if (dto.displayOrder !== undefined) updateData.displayOrder = dto.displayOrder;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.startDate !== undefined) updateData.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) updateData.endDate = dto.endDate ? new Date(dto.endDate) : null;

    const updated = await this.repository.update(id, updateData);
    if (!updated) {
      throw new NotFoundException('Không thể cập nhật quảng cáo');
    }
    return updated;
  }

  async toggleActive(id: string): Promise<Advertisement> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Quảng cáo không tồn tại');
    }
    const updated = await this.repository.update(id, { isActive: !existing.isActive });
    if (!updated) {
      throw new NotFoundException('Không thể cập nhật trạng thái quảng cáo');
    }
    return updated;
  }

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundException('Quảng cáo không tồn tại');
    }
    await this.repository.delete(id);
    return { success: true, message: 'Đã xóa quảng cáo thành công' };
  }

  async findById(id: string): Promise<Advertisement> {
    const ad = await this.repository.findById(id);
    if (!ad) {
      throw new NotFoundException('Quảng cáo không tồn tại');
    }
    return ad;
  }

  async getActiveBySlot(placementSlot: string, categoryId?: string): Promise<Advertisement[]> {
    return this.repository.findActiveBySlot(placementSlot, categoryId);
  }

  async findAll(query: QueryAdvertisementDto) {
    return this.repository.findAll(query);
  }

  async recordView(id: string): Promise<void> {
    await this.repository.incrementViews(id);
  }

  async recordClick(id: string): Promise<void> {
    await this.repository.incrementClicks(id);
  }

  private async validateCategoryId(categoryId?: string | null) {
    if (!categoryId) return;
    const category = await this.repository.findCategoryById(categoryId);
    if (!category) {
      throw new BadRequestException('Môn thể thao được chọn không tồn tại');
    }
  }

  private validateDates(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      if (start >= end) {
        throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
      }
    }
  }
}
