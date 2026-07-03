import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const REPORT_TARGET_TYPES = [
  'USER',
  'TOURNAMENT',
  'MATCH',
  'COMMUNITY',
] as const;

export const REPORT_CATEGORIES = [
  'CHEATING',
  'RULE_VIOLATION',
  'ABUSIVE_BEHAVIOR',
  'FAKE_INFORMATION',
  'PAYMENT_FRAUD',
  'UNSAFE_ORGANIZATION',
  'OTHER',
] as const;

export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export class CreateReportDto {
  @ApiProperty({ description: 'Loại đối tượng bị báo cáo', enum: REPORT_TARGET_TYPES })
  @IsEnum(REPORT_TARGET_TYPES)
  targetType: ReportTargetType;

  @ApiProperty({ description: 'ID của đối tượng bị tố cáo' })
  @IsUUID()
  targetId: string;

  @ApiProperty({ description: 'Nhóm hành vi vi phạm', enum: REPORT_CATEGORIES })
  @IsEnum(REPORT_CATEGORIES)
  category: ReportCategory;

  @ApiProperty({ description: 'Mô tả cụ thể hành vi vi phạm' })
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MinLength(10)
  @MaxLength(2000)
  reason: string;

  @ApiProperty({
    description: 'Tối đa 5 URL ảnh/tài liệu minh chứng',
    required: false,
    type: [String],
  })
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ require_protocol: true }, { each: true })
  @MaxLength(2048, { each: true })
  @IsOptional()
  evidenceUrls?: string[] = [];
}
