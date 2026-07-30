import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendSupportMessageDto {
  @ApiProperty({
    description: 'Nội dung tin nhắn hỗ trợ',
    example: 'Tôi cần hỗ trợ đăng ký giải đấu.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  messageText: string;
}
