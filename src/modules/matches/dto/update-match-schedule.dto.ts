import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsDateString, IsString } from 'class-validator';

export class UpdateMatchScheduleDto {
  @ApiPropertyOptional({ example: 'Sân số 1', description: 'Tên sân thi đấu' })
  @IsOptional()
  @IsString()
  courtName?: string;

  @ApiPropertyOptional({ example: '123 Đường ABC, Quận 1', description: 'Địa chỉ sân thi đấu' })
  @IsOptional()
  @IsString()
  courtAddress?: string;

  @ApiPropertyOptional({ example: 'uuid-referee', description: 'ID của trọng tài' })
  @IsOptional()
  @IsUUID()
  refereeId?: string;

  @ApiPropertyOptional({ example: '2026-10-15T08:00:00Z', description: 'Thời gian thi đấu dự kiến' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
