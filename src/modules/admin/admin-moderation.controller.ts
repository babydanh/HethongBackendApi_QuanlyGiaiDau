import { Controller, Post, Get, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  BanUserDto,
  ResolveReportDto,
  QueryReportsDto,
  ReportWorkflowNoteDto,
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

  @Get('reports')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Lấy danh sách các báo cáo vi phạm (Chỉ ADMIN)' })
  async listReports(@Query() query: QueryReportsDto) {
    return this.adminService.listReports(query);
  }

  @Get('reports/:id/actions')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Xem lịch sử xử lý của báo cáo vi phạm' })
  async getReportActions(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getReportActions(id);
  }

  @Post('reports/:id/triage')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Phân loại và nhận xử lý báo cáo mới' })
  async triageReport(
    @CurrentUser() moderator: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportWorkflowNoteDto,
  ) {
    return this.adminService.triageReport(id, moderator.sub, dto.note, dto.category);
  }

  @Post('reports/:id/start-review')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Bắt đầu xác minh báo cáo đã phân loại' })
  async startReportReview(
    @CurrentUser() moderator: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportWorkflowNoteDto,
  ) {
    return this.adminService.startReportReview(id, moderator.sub, dto.note);
  }

  @Post('reports/:id/escalate')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Chuyển báo cáo lên admin để xem xét chế tài nặng' })
  async escalateReport(
    @CurrentUser() moderator: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportWorkflowNoteDto,
  ) {
    return this.adminService.escalateReport(id, moderator.sub, dto.note);
  }

  @Post('reports/:id/resolve')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Giải quyết hoặc từ chối báo cáo vi phạm (Chỉ ADMIN)' })
  async resolveReport(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.adminService.resolveReport(
      id,
      admin.sub,
      dto.status,
      dto.resolutionNote,
      (admin.roles ?? []).includes(UserRole.ADMIN),
      dto.category,
    );
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
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async listTournaments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.adminService.listTournaments(pageNum, limitNum, search, status, cursor);
  }
}
