import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class UpdateFootballRosterDto {
  @ApiPropertyOptional({
    description: 'Danh sách cầu thủ chính được chọn lại cho roster giải',
    type: [String],
  })
  @IsArray()
  @IsOptional()
  @IsUUID('4', { each: true })
  memberIds?: string[];

  @ApiPropertyOptional({
    description: 'Danh sách cầu thủ dự bị được chọn lại cho roster giải',
    type: [String],
  })
  @IsArray()
  @IsOptional()
  @IsUUID('4', { each: true })
  reserveMemberIds?: string[];
}
