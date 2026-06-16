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
  @ApiQuery({ name: 'groupBy', required: false, enum: ['day', 'week', 'month', 'year'], description: 'Gom nhóm thống kê và phần trăm tăng trưởng' })
  async getMetrics(@Query('groupBy') groupBy?: 'day' | 'week' | 'month' | 'year') {
    return this.adminService.getMetrics(groupBy || 'month');
  }

  @Get('dashboard/revenue-chart')
  @ApiOperation({ summary: 'Lấy dữ liệu doanh thu và GMV theo thời gian (Chỉ ADMIN)' })
  @ApiQuery({ name: 'groupBy', required: false, enum: ['day', 'week', 'month', 'year'], description: 'Gom nhóm theo ngày, tuần, tháng hoặc năm' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Ngày bắt đầu lọc (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Ngày kết thúc lọc (YYYY-MM-DD)' })
  async getRevenueChart(
    @Query('groupBy') groupBy?: 'day' | 'week' | 'month' | 'year',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getRevenueChart(groupBy || 'month', startDate, endDate);
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
