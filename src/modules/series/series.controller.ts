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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SeriesService } from './series.service';
import { CreateSeriesDto } from './dto/create-series.dto';
import { UpdateSeriesDto } from './dto/update-series.dto';
import { QuerySeriesDto } from './dto/query-series.dto';
import { CreateLegDto, LinkEventDto } from './dto/leg.dto';
import { QueryStandingsDto } from './dto/query-standings.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

// ─── PUBLIC ENDPOINTS ─────────────────────────────────────────

@ApiTags('series')
@Controller('series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách các chuỗi giải đấu công khai' })
  async findAll(@Query() query: QuerySeriesDto) {
    return this.seriesService.findAll(query);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Lấy chi tiết chuỗi giải đấu theo ID hoặc slug' })
  async findOne(@Param('slug') slug: string) {
    return this.seriesService.findOne(slug);
  }

  @Public()
  @Get(':id/legs')
  @ApiOperation({ summary: 'Lấy danh sách các chặng đấu của chuỗi' })
  async findLegs(@Param('id', ParseUUIDPipe) id: string) {
    return this.seriesService.findLegs(id);
  }

  @Public()
  @Get(':id/legs/:legId/events')
  @ApiOperation({ summary: 'Lấy danh sách các sự kiện trong một chặng đấu' })
  async findEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('legId', ParseUUIDPipe) legId: string,
  ) {
    return this.seriesService.findEvents(legId);
  }

  @Public()
  @Get(':id/standings')
  @ApiOperation({ summary: 'Lấy bảng xếp hạng PSR của chuỗi' })
  async getStandings(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryStandingsDto,
  ) {
    return this.seriesService.getStandings(id, query);
  }

  @Public()
  @Get(':id/legs/:legId/categories/:categoryId/finals-qualifiers')
  @ApiOperation({ summary: 'Lấy danh sách VĐV đủ điều kiện tham gia vòng Chung kết tổng chặng' })
  async getFinalsQualifiers(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('legId', ParseUUIDPipe) legId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
  ) {
    return this.seriesService.calculateTourFinalsQualifiers(id, legId, categoryId);
  }
}

// ─── ORGANIZER/ADMIN ENDPOINTS ──────────────────────────────────

@ApiTags('organizer-series')
@Controller('organizer/series')
@ApiBearerAuth()
@Roles(UserRole.ORGANIZER, UserRole.ADMIN)
export class OrganizerSeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo chuỗi giải đấu mới' })
  async create(
    @Body() data: CreateSeriesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.create(user.sub, data);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin chuỗi giải đấu' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateSeriesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.update(id, user.sub, data, [user.role!]);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa chuỗi giải đấu (Soft Delete)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.remove(id, user.sub, [user.role!]);
  }

  @Post(':id/legs')
  @ApiOperation({ summary: 'Thêm chặng đấu mới vào chuỗi' })
  async createLeg(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: CreateLegDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.createLeg(id, user.sub, data, [user.role!]);
  }

  @Patch(':id/legs/:legId')
  @ApiOperation({ summary: 'Cập nhật chặng đấu' })
  async updateLeg(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('legId', ParseUUIDPipe) legId: string,
    @Body() data: Partial<CreateLegDto> & { status?: 'UPCOMING' | 'ONGOING' | 'COMPLETED' },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.updateLeg(id, legId, user.sub, data, [user.role!]);
  }

  @Delete(':id/legs/:legId')
  @ApiOperation({ summary: 'Xóa chặng đấu' })
  async deleteLeg(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('legId', ParseUUIDPipe) legId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.deleteLeg(id, legId, user.sub, [user.role!]);
  }

  @Post(':id/legs/:legId/events')
  @ApiOperation({ summary: 'Liên kết giải đấu vào chặng' })
  async linkTournament(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('legId', ParseUUIDPipe) legId: string,
    @Body() data: LinkEventDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.linkTournament(id, legId, user.sub, data, [user.role!]);
  }

  @Delete(':id/legs/:legId/events/:eventId')
  @ApiOperation({ summary: 'Hủy liên kết giải đấu khỏi chặng' })
  async unlinkTournament(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('legId', ParseUUIDPipe) legId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.unlinkTournament(id, eventId, user.sub, [user.role!]);
  }

  @Post(':id/reset-season')
  @ApiOperation({ summary: 'Reset điểm tích lũy của chuỗi giải đấu cho mùa giải mới' })
  async resetSeason(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.resetSeason(id, user.sub, [user.role!]);
  }
}
