import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SendFriendRequestDto {
  @ApiProperty({
    example: 'uuid-user-id',
    description: 'ID của người nhận lời mời kết bạn',
  })
  @IsUUID()
  receiverId: string;
}
