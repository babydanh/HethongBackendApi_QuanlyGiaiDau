import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  Post,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { CreateChangeRequestDto } from './dto/create-change-request.dto';
import { QueryMyReportsDto } from './dto/query-my-reports.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { UserRole } from '../../common/constants/enums';
import { UpdateSystemRolesDto } from './dto/update-system-roles.dto';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  @ApiResponse({ status: 200, description: 'Return list of users' })
  async findAll(@Query() query: QueryUserDto) {
    return this.usersService.findAll(query);
  }

  @Get('search/public')
  @ApiOperation({ summary: 'Tìm kiếm người dùng công khai để mời vào nhóm' })
  @ApiResponse({ status: 200, description: 'Danh sách người dùng khớp từ khoá' })
  async searchPublic(@Query('q') q: string) {
    if (!q || q.trim().length < 2) return { data: [] };
    return this.usersService.findAll({ search: q, page: 1, limit: 10 });
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Tìm kiếm người dùng qua email hoặc số điện thoại' })
  @ApiResponse({ status: 200, description: 'Danh sách người dùng khớp từ khóa' })
  async search(@Query('q') q: string) {
    if (!q || q.trim().length < 2) return [];
    return this.usersService.searchUsers(q);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Return user profile' })
  async getProfile(@CurrentUser() user: { id: string }) {
    return this.usersService.getProfile(user.id);
  }

  @Get('reports/me')
  @ApiOperation({ summary: 'Xem và theo dõi các báo cáo vi phạm đã gửi' })
  async getMyReports(
    @CurrentUser() user: { id: string },
    @Query() query: QueryMyReportsDto,
  ) {
    return this.usersService.getMyReports(user.id, query);
  }

  @Public()
  @SkipThrottle()
  @Get(':id/public')
  @ApiOperation({ summary: 'Lấy thông tin hồ sơ công khai của người dùng' })
  @ApiResponse({ status: 200, description: 'Trả về hồ sơ công khai của người dùng' })
  async getPublicProfile(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user by id (Admin only)' })
  @ApiResponse({ status: 200, description: 'Return a single user' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id/system-roles')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Thay thế quyền hệ thống của người dùng (Admin)' })
  @ApiResponse({ status: 200, description: 'Quyền hệ thống đã được cập nhật' })
  @ApiResponse({ status: 400, description: 'Không thể tự hạ quyền hoặc gỡ Admin cuối cùng' })
  async updateSystemRoles(
    @CurrentUser() admin: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSystemRolesDto,
  ) {
    return this.usersService.updateSystemRoles(admin.id, id, dto.roles);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(
    @CurrentUser() user: { id: string },
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user.id, updateUserDto);
  }

  @Post('profile/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiResponse({ status: 201, description: 'Avatar uploaded and profile updated' })
  async uploadAvatar(
    @CurrentUser() user: { id: string },
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(user.id, file);
  }

  @Post('profile/cover')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload user profile cover photo' })
  @ApiResponse({ status: 201, description: 'Cover photo uploaded and profile updated' })
  async uploadCover(
    @CurrentUser() user: { id: string },
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.usersService.uploadCover(user.id, file);
  }

  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @CurrentUser() user: { id: string },
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.id, changePasswordDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete user (Admin only)' })
  @ApiResponse({ status: 204, description: 'User deleted' })
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Post('reports')
  @ApiOperation({ summary: 'Gửi báo cáo vi phạm (Người dùng tố cáo)' })
  async createReport(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateReportDto,
  ) {
    return this.usersService.createReport(user.id, dto);
  }

  @Post('delete-account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Người chơi tự xóa tài khoản cá nhân' })
  async deleteAccount(
    @CurrentUser() user: { id: string },
    @Body() body: { password: string },
  ) {
    return this.usersService.deleteAccount(user.id, body);
  }

  @Post('change-requests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gửi yêu cầu thay đổi giới tính (Admin duyệt)' })
  async createChangeRequest(
    @CurrentUser() user: { id: string },
    @Body() body: CreateChangeRequestDto,
  ) {
    return this.usersService.createChangeRequest(user.id, body.requestType, body.newValue);
  }

  @Get('admin/change-requests')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy danh sách yêu cầu đổi giới tính (Admin)' })
  async findChangeRequests(@Query('status') status?: string) {
    return this.usersService.findChangeRequests(status);
  }

  @Patch('admin/change-requests/:id/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Duyệt yêu cầu đổi giới tính (Admin)' })
  async approveChangeRequest(
    @Param('id') id: string,
    @Body() body: { adminNote?: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.usersService.approveChangeRequest(id, user.id, body.adminNote);
  }

  @Patch('admin/change-requests/:id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Từ chối yêu cầu đổi giới tính (Admin)' })
  async rejectChangeRequest(
    @Param('id') id: string,
    @Body() body: { adminNote?: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.usersService.rejectChangeRequest(id, user.id, body.adminNote);
  }
}
