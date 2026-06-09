import { Controller, Get, Post, Body, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { SocialService } from './social.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { UpdateFriendshipDto } from './dto/update-friendship.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('social')
@ApiBearerAuth()
@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Post('friend-requests')
  @ApiOperation({ summary: 'Gửi lời mời kết bạn' })
  async sendFriendRequest(
    @Body() sendFriendRequestDto: SendFriendRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.socialService.sendFriendRequest(user.sub, sendFriendRequestDto);
  }

  @Patch('friend-requests/:id')
  @ApiOperation({ summary: 'Phản hồi lời mời kết bạn (Chấp nhận/Từ chối)' })
  async respondToRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateFriendshipDto: UpdateFriendshipDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.socialService.respondToRequest(user.sub, id, updateFriendshipDto);
  }

  @Get('friends')
  @ApiOperation({ summary: 'Lấy danh sách bạn bè (và lời mời)' })
  async getFriends(@CurrentUser() user: JwtPayload) {
    return this.socialService.getMyFriends(user.sub);
  }
}
