import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSupportConversationDto {
  @ApiPropertyOptional({
    example: 'Tôi cần hỗ trợ đăng ký giải đấu.',
    description: 'Tin nhắn đầu tiên gửi cho bộ phận hỗ trợ.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  messageText?: string;
}
