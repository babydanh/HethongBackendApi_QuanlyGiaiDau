import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SeriesService } from './series.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('series-staff')
@Controller('series/invitations')
@ApiBearerAuth()
export class SeriesInvitationsController {
  constructor(private readonly seriesService: SeriesService) {}

  @Post(':id/accept')
  @ApiOperation({ summary: 'Chấp nhận lời mời làm nhân sự chuỗi giải đấu' })
  async acceptInvitation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.acceptInvitation(id, user);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Từ chối lời mời làm nhân sự chuỗi giải đấu' })
  async rejectInvitation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.rejectInvitation(id, user);
  }
}

@ApiTags('organizer-series-staff')
@Controller('organizer/series')
@ApiBearerAuth()
@Roles(UserRole.ORGANIZER, UserRole.ADMIN)
export class OrganizerSeriesStaffController {
  constructor(private readonly seriesService: SeriesService) {}

  @Post(':id/invitations')
  @ApiOperation({ summary: 'Mời một nhân sự tham gia vận hành chuỗi giải đấu' })
  async inviteStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { emailOrPhone: string; role: 'CO_ORGANIZER' | 'REFEREE' | 'CLERK' },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.inviteStaff(
      id,
      user.sub,
      body.emailOrPhone,
      body.role,
      [user.role],
    );
  }

  @Get(':id/invitations')
  @ApiOperation({ summary: 'Xem danh sách các lời mời của chuỗi giải đấu' })
  async listInvitations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.listInvitations(id, user.sub, [user.role]);
  }

  @Get(':id/managers')
  @ApiOperation({ summary: 'Xem danh sách quản trị viên và nhân sự của chuỗi' })
  async listManagers(@Param('id', ParseUUIDPipe) id: string) {
    return this.seriesService.listManagers(id);
  }

  @Delete(':id/managers/:userId')
  @ApiOperation({ summary: 'Thu hồi quyền quản trị viên/nhân sự chặng' })
  async revokeManager(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userIdToRevoke: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.seriesService.revokeManager(id, userIdToRevoke, user.sub, [user.role]);
  }
}
