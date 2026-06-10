import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsDateString } from 'class-validator';

export class UpdateMatchScheduleDto {
  @ApiPropertyOptional({ example: 'uuid-court', description: 'ID của sân thi đấu' })
  @IsOptional()
  @IsUUID()
  courtId?: string;

  @ApiPropertyOptional({ example: 'uuid-referee', description: 'ID của trọng tài' })
  @IsOptional()
  @IsUUID()
  refereeId?: string;

  @ApiPropertyOptional({ example: '2026-10-15T08:00:00Z', description: 'Thời gian thi đấu dự kiến' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
