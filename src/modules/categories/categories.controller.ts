import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryCategoryDto } from './dto/query-category.dto';
import { CreateEloTierDto } from './dto/create-elo-tier.dto';
import { UpdateEloTierDto } from './dto/update-elo-tier.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // --- CATEGORIES ---

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách môn thể thao (categories)' })
  @ApiResponse({ status: 200, description: 'Danh sách môn thể thao' })
  async findAll(@Query() query: QueryCategoryDto) {
    return await this.categoriesService.findAllCategories(query);
  }

  @Public()
  @SkipThrottle()
  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết 1 môn thể thao' })
  @ApiResponse({ status: 200, description: 'Chi tiết môn thể thao' })
  @ApiResponse({ status: 404, description: 'Không tìm thấy' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return await this.categoriesService.findCategoryById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo môn thể thao mới (Chỉ ADMIN)' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  @ApiResponse({ status: 409, description: 'Slug đã tồn tại' })
  async create(@Body() createCategoryDto: CreateCategoryDto) {
    return await this.categoriesService.createCategory(createCategoryDto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật môn thể thao (Chỉ ADMIN)' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return await this.categoriesService.updateCategory(id, updateCategoryDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa môn thể thao (Chỉ ADMIN)' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return await this.categoriesService.deleteCategory(id);
  }

  // --- ELO TIERS ---

  @Public()
  @SkipThrottle()
  @Get(':id/elo-tiers')
  @ApiOperation({ summary: 'Lấy danh sách các bậc ELO của 1 môn thể thao' })
  @ApiResponse({ status: 200, description: 'Danh sách bậc ELO' })
  async findEloTiers(@Param('id', ParseUUIDPipe) id: string) {
    return await this.categoriesService.findEloTiersByCategory(id);
  }

  @Post(':id/elo-tiers')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm bậc ELO cho môn thể thao (Chỉ ADMIN)' })
  @ApiResponse({ status: 201, description: 'Tạo thành công' })
  async createEloTier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() createEloTierDto: CreateEloTierDto,
  ) {
    return await this.categoriesService.createEloTier(id, createEloTierDto);
  }

  @Patch(':categoryId/elo-tiers/:tierId')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật bậc ELO (Chỉ ADMIN)' })
  @ApiResponse({ status: 200, description: 'Cập nhật thành công' })
  async updateEloTier(
    @Param('categoryId', ParseUUIDPipe) categoryId: string, // Kept for route nesting clarity, though unused in service if tierId is PK
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @Body() updateEloTierDto: UpdateEloTierDto,
  ) {
    return await this.categoriesService.updateEloTier(tierId, updateEloTierDto);
  }

  @Delete(':categoryId/elo-tiers/:tierId')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa bậc ELO (Chỉ ADMIN)' })
  @ApiResponse({ status: 200, description: 'Xóa thành công' })
  async removeEloTier(
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Param('tierId', ParseUUIDPipe) tierId: string,
  ) {
    return await this.categoriesService.deleteEloTier(tierId);
  }
}
