import { Controller, Post, Get, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  BanUserDto,
  RevertMatchDto,
  ResolveReportDto,
  TournamentAdminActionDto,
} from './dto/admin.dto';

@ApiTags('admin-moderation')
@Controller('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
export class AdminModerationController {
  constructor(private readonly adminService: AdminService) {}

  @Post('users/:id/ban')
  @ApiOperation({ summary: 'Phạt / Khóa tài khoản người dùng (Chỉ ADMIN)' })
  async banUser(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: BanUserDto,
  ) {
    return this.adminService.banUser(userId, admin.sub, dto.reason, dto.banType, dto.expiresAt);
  }

  @Post('users/:id/unban')
  @ApiOperation({ summary: 'Mở khóa tài khoản người dùng (Chỉ ADMIN)' })
  async unbanUser(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) userId: string,
  ) {
    return this.adminService.unbanUser(userId, admin.sub);
  }

  @Post('matches/:id/revert')
  @ApiOperation({ summary: 'Khôi phục kết quả gốc của trận đấu bị tranh chấp (Chỉ ADMIN)' })
  async revertMatch(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) matchId: string,
    @Body() dto: RevertMatchDto,
  ) {
    return this.adminService.revertMatch(matchId, admin.sub, dto.resolutionNote);
  }

  @Get('reports')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Lấy danh sách các báo cáo vi phạm (Chỉ ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listReports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.adminService.listReports(pageNum, limitNum);
  }

  @Post('reports/:id/resolve')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Giải quyết hoặc từ chối báo cáo vi phạm (Chỉ ADMIN)' })
  async resolveReport(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.adminService.resolveReport(id, admin.sub, dto.status, dto.resolutionNote);
  }

  @Post('tournaments/:id/suspend')
  @ApiOperation({ summary: 'Tạm đình chỉ hoạt động của giải đấu (Chỉ ADMIN)' })
  async suspendTournament(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TournamentAdminActionDto,
  ) {
    return this.adminService.suspendTournament(id, admin.sub, dto.note);
  }

  @Post('tournaments/:id/unsuspend')
  @ApiOperation({ summary: 'Khôi phục hoạt động giải đấu bị đình chỉ (Chỉ ADMIN)' })
  async unsuspendTournament(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.unsuspendTournament(id, admin.sub);
  }

  @Post('tournaments/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Duyệt giải đấu tính điểm ELO (Chỉ ADMIN)' })
  async approveTournament(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.approveTournament(id, admin.sub);
  }

  @Post('tournaments/:id/reject')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Từ chối duyệt giải đấu tính điểm ELO (Chỉ ADMIN)' })
  async rejectTournament(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TournamentAdminActionDto,
  ) {
    return this.adminService.rejectTournament(id, admin.sub, dto.note);
  }

  @Post('tournaments/:id/ban')
  @ApiOperation({ summary: 'Hủy/Cấm vĩnh viễn giải đấu (Chỉ ADMIN)' })
  async banTournament(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TournamentAdminActionDto,
  ) {
    return this.adminService.banTournament(id, admin.sub, dto.note);
  }

  @Post('tournaments/:id/approve-delete')
  @ApiOperation({ summary: 'Duyệt yêu cầu xóa giải đấu (Chỉ ADMIN)' })
  async approveDeleteTournament(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.approveDeleteTournament(id, admin.sub);
  }

  @Post('tournaments/:id/reject-delete')
  @ApiOperation({ summary: 'Từ chối yêu cầu xóa giải đấu (Chỉ ADMIN)' })
  async rejectDeleteTournament(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TournamentAdminActionDto,
  ) {
    return this.adminService.rejectDeleteTournament(id, admin.sub, dto.note);
  }

  @Get('tournaments')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Lấy danh sách giải đấu để quản lý (Chỉ ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  async listTournaments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.adminService.listTournaments(pageNum, limitNum, search, status);
  }
}
