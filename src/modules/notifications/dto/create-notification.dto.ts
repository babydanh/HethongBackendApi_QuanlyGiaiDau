import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty({
    example: 'uuid-receiver-id',
    description: 'Người nhận thông báo',
  })
  @IsUUID()
  receiverId: string;

  @ApiPropertyOptional({
    example: 'uuid-sender-id',
    description: 'Người kích hoạt thông báo (nếu có)',
  })
  @IsUUID()
  @IsOptional()
  senderId?: string;

  @ApiProperty({
    example: 'FRIEND_REQUEST',
    description: 'Loại thông báo',
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({
    example: 'Yêu cầu kết bạn mới',
    description: 'Tiêu đề thông báo',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'Nguyễn Văn A muốn kết bạn với bạn',
    description: 'Nội dung',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({
    example: '/player/profile/uuid-sender-id',
    description: 'Link chuyển hướng khi click',
  })
  @IsString()
  @IsOptional()
  redirectUrl?: string;
}
