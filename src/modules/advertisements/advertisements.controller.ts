import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { AdvertisementsService } from './advertisements.service';
import { CreateAdvertisementDto } from './dto/create-advertisement.dto';
import { QueryAdvertisementDto } from './dto/query-advertisement.dto';
import { UpdateAdvertisementDto } from './dto/update-advertisement.dto';

@ApiTags('advertisements')
@Controller('advertisements')
export class AdvertisementsController {
  constructor(private readonly advertisementsService: AdvertisementsService) {}

  // --- PUBLIC ENDPOINTS (CONSUMERS) ---

  @Public()
  @SkipThrottle()
  @Get('active')
  @ApiOperation({ summary: 'Lấy danh sách banner quảng cáo đang hoạt động theo vị trí' })
  @ApiResponse({ status: 200, description: 'Danh sách banner quảng cáo đang active' })
  async getActiveBySlot(@Query('slot') slot: string) {
    if (!slot) return [];
    return this.advertisementsService.getActiveBySlot(slot);
  }

  @Public()
  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ghi nhận lượt xem banner' })
  async recordView(@Param('id', ParseUUIDPipe) id: string) {
    await this.advertisementsService.recordView(id);
    return { success: true };
  }

  @Public()
  @Post(':id/click')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ghi nhận lượt nhấp (click) banner' })
  async recordClick(@Param('id', ParseUUIDPipe) id: string) {
    await this.advertisementsService.recordClick(id);
    return { success: true };
  }

  // --- ADMIN MANAGEMENT ENDPOINTS ---

  @Get('admin/list')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách toàn bộ banner cho Admin quản lý' })
  async findAllForAdmin(@Query() query: QueryAdvertisementDto) {
    return this.advertisementsService.findAll(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xem chi tiết 1 banner' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.advertisementsService.findById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo mới banner quảng cáo' })
  async create(@Body() dto: CreateAdvertisementDto) {
    return this.advertisementsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật banner quảng cáo' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdvertisementDto,
  ) {
    return this.advertisementsService.update(id, dto);
  }

  @Patch(':id/toggle')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bật/Tắt hiển thị banner' })
  async toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return this.advertisementsService.toggleActive(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa banner quảng cáo' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.advertisementsService.delete(id);
  }
}
