import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UpdateConfigDto } from './dto/admin.dto';

@ApiTags('admin-config')
@Controller('admin/configs')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
export class AdminConfigController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy toàn bộ danh sách cấu hình hệ thống (Chỉ ADMIN)' })
  async getConfigs() {
    return this.adminService.getConfigs();
  }

  @Put(':key')
  @ApiOperation({ summary: 'Tạo hoặc cập nhật cấu hình hệ thống (Chỉ ADMIN)' })
  async updateConfig(
    @CurrentUser() admin: JwtPayload,
    @Param('key') key: string,
    @Body() dto: UpdateConfigDto,
  ) {
    return this.adminService.updateConfig(key, dto.value, dto.description || '', admin.sub);
  }
}
