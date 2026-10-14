import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { RosterImportItemDto } from './roster-import.dto';

export class RosterImportBatchItemDto extends OmitType(RosterImportItemDto, ['player1Email'] as const) {
  @ApiPropertyOptional({ description: 'Email VĐV 1; có thể để trống khi chưa có tài khoản' })
  @IsOptional()
  @IsEmail()
  player1Email?: string;
  @ApiPropertyOptional({ description: 'Chỉ số dòng ổn định trong workbook, chỉ echo ở preview' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(499)
  clientRowIndex?: number;

  @ApiPropertyOptional({ description: 'Tên sheet nguồn, chỉ lưu làm provenance' })
  @IsOptional()
  @IsString()
  @MaxLength(31)
  sourceSheetName?: string;

  @ApiPropertyOptional({ description: 'Số dòng worksheet nguồn, bắt đầu từ 1' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1048576)
  sourceRowIndex?: number;

  @ApiPropertyOptional({ description: 'Tài khoản VĐV 1 do organizer xác nhận theo đúng email' })
  @IsOptional()
  @IsUUID()
  confirmedPlayer1UserId?: string;

  @ApiPropertyOptional({ description: 'Tài khoản VĐV 2 do organizer xác nhận theo đúng email' })
  @IsOptional()
  @IsUUID()
  confirmedPlayer2UserId?: string;
}

export class RosterImportBatchGroupDto {
  @ApiPropertyOptional({ description: 'Division hiện có; null nếu giải không dùng division' })
  @IsOptional()
  @IsUUID()
  divisionId?: string | null;

  @ApiProperty({ type: [RosterImportBatchItemDto], maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RosterImportBatchItemDto)
  participants: RosterImportBatchItemDto[];
}

export class RosterImportBatchDto {
  @ApiProperty({ type: [RosterImportBatchGroupDto], maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => RosterImportBatchGroupDto)
  groups: RosterImportBatchGroupDto[];

  @ApiPropertyOptional({
    deprecated: true,
    description:
      'Đã bỏ: được nhận và bỏ qua để client cũ không bị 400. Người có tài khoản luôn nhận đúng một thông báo xác nhận.',
  })
  @IsOptional()
  @IsBoolean()
  notifyLinkedAccounts?: boolean;
}
