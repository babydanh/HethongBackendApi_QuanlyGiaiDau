import { Type } from 'class-transformer';
import {
  IsString,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsInt,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  REPORT_CATEGORIES,
  REPORT_TARGET_TYPES,
  type ReportCategory,
  type ReportTargetType,
} from '../../users/dto/create-report.dto';
import {
  REPORT_STATUSES,
  type ReportStatus,
} from '../../users/dto/query-my-reports.dto';

export class SubmitTicketDto {
  @ApiProperty({ description: 'Danh sách các link ảnh minh chứng giấy phép, hoạt động' })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  evidenceUrls: string[];

  @ApiProperty({ description: 'Số điện thoại liên hệ' })
  @IsString()
  @IsNotEmpty()
  contactPhone: string;
}

export class RejectTicketDto {
  @ApiProperty({ description: 'Lý do từ chối yêu cầu xác minh' })
  @IsString()
  @IsNotEmpty()
  rejectReason: string;
}

export class BanUserDto {
  @ApiProperty({ description: 'Lý do phạt/khóa tài khoản' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ description: 'Loại hình phạt', enum: ['WARN', 'SOFT_BAN', 'HARD_BAN'] })
  @IsEnum(['WARN', 'SOFT_BAN', 'HARD_BAN'])
  banType: 'WARN' | 'SOFT_BAN' | 'HARD_BAN';

  @ApiProperty({ description: 'Ngày hết hạn khóa (Chỉ áp dụng cho SOFT_BAN)', required: false })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateConfigDto {
  @ApiProperty({ description: 'Giá trị cấu hình mới' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiProperty({ description: 'Mô tả cấu hình', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

export class ResolveReportDto {
  @ApiProperty({ description: 'Trạng thái giải quyết báo cáo', enum: ['RESOLVED', 'REJECTED'] })
  @IsEnum(['RESOLVED', 'REJECTED'])
  status: 'RESOLVED' | 'REJECTED';

  @ApiProperty({ description: 'Ghi chú giải quyết báo cáo' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  resolutionNote: string;
}

export class ReportWorkflowNoteDto {
  @ApiProperty({ description: 'Ghi chú nghiệp vụ cho bước xử lý' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  note: string;
}

export class QueryReportsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
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

  @ApiPropertyOptional({ description: 'Từ ngày tạo, chuẩn ISO-8601' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Đến ngày tạo, chuẩn ISO-8601' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ description: 'Tìm trong lý do, email/tên người báo cáo và tên đối tượng' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;
}

export class TournamentAdminActionDto {
  @ApiProperty({
    description: 'Ghi chú hoặc lý do xử lý của quản trị viên',
    required: false,
  })
  @IsString()
  @IsOptional()
  note?: string;
}
