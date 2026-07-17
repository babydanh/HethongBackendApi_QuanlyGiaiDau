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
import { VenuesService } from './venues.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { QueryVenueDto } from './dto/query-venue.dto';
import { CreateVenueCourtDto } from './dto/create-venue-court.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Verified } from '../../common/decorators/verified.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('venues')
@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách địa điểm thi đấu' })
  async findAll(@Query() query: QueryVenueDto) {
    return this.venuesService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Lấy chi tiết địa điểm thi đấu (kèm danh sách sân)',
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.venuesService.findOne(id);
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo địa điểm thi đấu mới' })
  async create(
    @Body() createVenueDto: CreateVenueDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.venuesService.create(user.sub, createVenueDto);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật địa điểm thi đấu' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateVenueDto: UpdateVenueDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.venuesService.update(id, user.sub, updateVenueDto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Xóa địa điểm thi đấu' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.venuesService.remove(id);
  }

  // --- COURTS ---

  @Post(':id/courts')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm sân con vào địa điểm thi đấu' })
  async addCourt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() createVenueCourtDto: CreateVenueCourtDto,
  ) {
    return this.venuesService.addCourt(id, createVenueCourtDto);
  }

  @Delete(':id/courts/:courtId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa sân con khỏi địa điểm thi đấu' })
  async removeCourt(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('courtId', ParseUUIDPipe) courtId: string,
  ) {
    return this.venuesService.removeCourt(id, courtId);
  }
}
