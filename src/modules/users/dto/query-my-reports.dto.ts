import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  REPORT_CATEGORIES,
  REPORT_TARGET_TYPES,
  type ReportCategory,
  type ReportTargetType,
} from './create-report.dto';

export const REPORT_STATUSES = [
  'SUBMITTED',
  'TRIAGED',
  'UNDER_REVIEW',
  'ESCALATED',
  'RESOLVED',
  'REJECTED',
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export class QueryMyReportsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit = 10;

  @ApiPropertyOptional({ enum: REPORT_STATUSES })
  @IsEnum(REPORT_STATUSES)
  @IsOptional()
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: REPORT_TARGET_TYPES })
  @IsEnum(REPORT_TARGET_TYPES)
  @IsOptional()
  targetType?: ReportTargetType;

  @ApiPropertyOptional({ enum: REPORT_CATEGORIES })
  @IsEnum(REPORT_CATEGORIES)
  @IsOptional()
  category?: ReportCategory;
}
