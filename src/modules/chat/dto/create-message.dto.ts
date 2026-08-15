import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsOptional, IsArray } from 'class-validator';

export class CreateMessageDto {
  @ApiProperty({
    example: 'uuid-room-id',
    description: 'ID của phòng chat',
  })
  @IsUUID()
  roomId: string;

  @ApiPropertyOptional({
    example: 'Chào mọi người!',
    description: 'Nội dung tin nhắn text',
  })
  @IsString()
  @IsOptional()
  messageText?: string;

  @ApiPropertyOptional({
    example: ['https://example.com/image.png'],
    description: 'Danh sách đính kèm (ảnh/video)',
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  attachmentsUrls?: string[];

  @ApiPropertyOptional({
    example: 'uuid-message-id',
    description: 'ID tin nhắn được trả lời/trích dẫn',
  })
  @IsUUID()
  @IsOptional()
  replyToId?: string;
}
