import { Controller, Get, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';

@ApiTags('admin')
@Controller('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard/metrics')
  @ApiOperation({ summary: 'Lấy dữ liệu GMV, doanh thu, escrow và số lượng giao dịch (Chỉ ADMIN)' })
  async getMetrics() {
    return this.adminService.getMetrics();
  }

  @Get('dashboard/revenue-chart')
  @ApiOperation({ summary: 'Lấy dữ liệu doanh thu và GMV theo thời gian (Chỉ ADMIN)' })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['week', 'month', 'year'], description: 'Gom nhóm theo tuần, tháng hoặc năm' })
  async getRevenueChart(
    @Query('groupBy') groupBy?: 'week' | 'month' | 'year',
  ) {
    return this.adminService.getRevenueChart(groupBy || 'month');
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Lấy nhật ký hoạt động hệ thống (Chỉ ADMIN)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Trang hiện tại' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Số bản ghi mỗi trang' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Tìm kiếm theo bảng hoặc hành động' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Lọc theo ID người dùng' })
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('userId') userId?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.adminService.getAuditLogs(pageNum, limitNum, search, userId);
  }
}
