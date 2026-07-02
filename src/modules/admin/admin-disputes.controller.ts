import { Controller, Post, Get, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RevertMatchDto } from './dto/admin.dto';

@ApiTags('admin-disputes')
@Controller('admin/disputes')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
export class AdminDisputesController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Lấy danh sách các khiếu nại tranh chấp (Chỉ ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.adminService.listDisputes(pageNum, limitNum);
  }

  @Get(':id/diff')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Xem chi tiết chênh lệch tỉ số của khiếu nại (Chỉ ADMIN)' })
  async getDiff(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getDisputeDiff(id);
  }

  @Post(':id/revert')
  @ApiOperation({ summary: 'Khôi phục tỉ số gốc của trận đấu tranh chấp và tính toán lại chuỗi ELO (Chỉ ADMIN)' })
  async revert(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevertMatchDto,
  ) {
    return this.adminService.revertMatch(id, admin.sub, dto.resolutionNote);
  }
}
