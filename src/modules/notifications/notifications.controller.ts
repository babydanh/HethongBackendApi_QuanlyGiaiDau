import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { MarkAllNotificationsDto } from './dto/mark-all-notifications.dto';
import { RegisterDeviceTokenDto, RemoveDeviceTokenDto } from './dto/register-device-token.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo của user' })
  async getMyNotifications(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.getMyNotifications(user.sub, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Lấy số lượng thông báo chưa đọc của user' })
  async getUnreadCount(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.getUnreadCount(user.sub, query.scope);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu 1 thông báo là đã đọc' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificationsService.markAsRead(id, user.sub);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo là đã đọc' })
  async markAllAsRead(
    @CurrentUser() user: JwtPayload,
    @Body() body: MarkAllNotificationsDto,
  ) {
    return this.notificationsService.markAllAsRead(user.sub, body.scope);
  }

  @Post('device-token')
  @ApiOperation({ summary: 'Đăng ký FCM Device Token để nhận Push Notification' })
  async registerDeviceToken(
    @CurrentUser() user: JwtPayload,
    @Body() body: RegisterDeviceTokenDto,
  ) {
    return this.notificationsService.registerDeviceToken(user.sub, body);
  }

  @Delete('device-token')
  @ApiOperation({ summary: 'Hủy FCM Device Token khi đăng xuất' })
  async removeDeviceToken(
    @CurrentUser() user: JwtPayload,
    @Body() body: RemoveDeviceTokenDto,
  ) {
    await this.notificationsService.removeDeviceToken(user.sub, body);
    return { success: true };
  }
}
