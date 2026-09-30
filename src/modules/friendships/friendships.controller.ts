import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FriendshipsService } from './friendships.service';

type RequestUser = { id: string };

export class SendFriendRequestDto {
  @IsUUID()
  receiverId!: string;
}

export enum FriendRequestAction {
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export class RespondFriendRequestDto {
  @IsEnum(FriendRequestAction)
  action!: FriendRequestAction;
}

/**
 * Bạn bè — phục hồi các route mà web đang gọi tại `src/features/social/api.ts`.
 *
 * Chỉ phục hồi phần bạn bè. Chức năng đăng bài profile đã được gỡ và không
 * được dựng lại ở đây. Prefix giữ nguyên `/social` vì đó là hợp đồng client
 * đã khai báo; tên module thì không, để không đụng cổng khoá feature social.
 */
@ApiTags('social')
@ApiBearerAuth()
@Controller('social')
export class FriendshipsController {
  constructor(private readonly friendships: FriendshipsService) {}

  @Get('friends')
  list(@CurrentUser() user: RequestUser) {
    return this.friendships.list(user);
  }

  @Get('friendships/status/:userId')
  status(
    @CurrentUser() user: RequestUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.friendships.status(user, userId);
  }

  @Post('friend-requests')
  send(@CurrentUser() user: RequestUser, @Body() dto: SendFriendRequestDto) {
    return this.friendships.sendRequest(user, dto.receiverId);
  }

  @Patch('friend-requests/:id')
  respond(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RespondFriendRequestDto,
  ) {
    return this.friendships.respond(user, id, dto.action);
  }

  @Delete('friendships/:id')
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.friendships.remove(user, id);
  }
}
