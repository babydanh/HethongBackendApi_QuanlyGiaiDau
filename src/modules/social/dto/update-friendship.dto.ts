import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum FriendshipAction {
  ACCEPT = 'ACCEPTED',
  REJECT = 'REJECTED',
}

export class UpdateFriendshipDto {
  @ApiProperty({
    example: 'ACCEPTED',
    enum: FriendshipAction,
    description: 'Hành động phản hồi lời mời kết bạn',
  })
  @IsEnum(FriendshipAction)
  action: FriendshipAction;
}
