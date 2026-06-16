import { Controller, Post, Get, Patch, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SubmitTicketDto, RejectTicketDto } from './dto/admin.dto';

@ApiTags('admin-tickets')
@Controller('admin/verification-tickets')
@ApiBearerAuth()
export class AdminTicketsController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  @ApiOperation({ summary: 'Gửi yêu cầu xác minh tài khoản người dùng' })
  async submit(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitTicketDto,
  ) {
    return this.adminService.submitVerificationTicket(user.sub, dto.evidenceUrls, dto.contactPhone);
  }

  @Get('my')
  @ApiOperation({ summary: 'Lấy danh sách các yêu cầu xác minh của tôi' })
  async getMyTickets(@CurrentUser() user: JwtPayload) {
    return this.adminService.getUserVerificationTickets(user.sub);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách các yêu cầu xác minh (Chỉ ADMIN)' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.adminService.listVerificationTickets(status, pageNum, limitNum);
  }

  @Patch(':id/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Phê duyệt yêu cầu xác minh (Chỉ ADMIN)' })
  async approve(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminService.approveVerificationTicket(id, admin.sub);
  }

  @Patch(':id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Từ chối yêu cầu xác minh (Chỉ ADMIN)' })
  async reject(
    @CurrentUser() admin: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectTicketDto,
  ) {
    return this.adminService.rejectVerificationTicket(id, admin.sub, dto.rejectReason);
  }
}
