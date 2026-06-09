import { Controller, Get, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thông báo của user' })
  async getMyNotifications(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.getMyNotifications(user.sub);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Đánh dấu 1 thông báo là đã đọc' })
  async markAsRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.markAsRead(id);
  }
}
