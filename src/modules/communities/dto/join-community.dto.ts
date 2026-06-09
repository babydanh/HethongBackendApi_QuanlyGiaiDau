import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsObject } from 'class-validator';

export class JoinCommunityDto {
  @ApiPropertyOptional({ description: 'Câu trả lời cho các câu hỏi xin vào' })
  @IsObject()
  @IsOptional()
  joinAnswers?: Record<string, string>;
}
