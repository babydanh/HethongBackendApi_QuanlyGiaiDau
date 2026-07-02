import { IsString, IsArray, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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

export class RevertMatchDto {
  @ApiProperty({ description: 'Biên bản/Ghi chú giải quyết khiếu nại' })
  @IsString()
  @IsNotEmpty()
  resolutionNote: string;
}

export class ResolveReportDto {
  @ApiProperty({ description: 'Trạng thái giải quyết báo cáo', enum: ['RESOLVED', 'REJECTED'] })
  @IsEnum(['RESOLVED', 'REJECTED'])
  status: 'RESOLVED' | 'REJECTED';

  @ApiProperty({ description: 'Ghi chú giải quyết báo cáo' })
  @IsString()
  @IsNotEmpty()
  resolutionNote: string;
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
