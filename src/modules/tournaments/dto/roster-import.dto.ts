import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export const IMPORT_SOURCES = [
  'MANUAL_EMAIL',
  'EXCEL',
  'AI_EXCEL',
  'GOOGLE_FORM',
] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

export const ROSTER_ENTRY_TYPES = ['REGULAR', 'WILD_CARD_REQUEST'] as const;
export type RosterEntryType = (typeof ROSTER_ENTRY_TYPES)[number];

/**
 * Strict roster row for `POST /tournaments/:id/roster-import`.
 *
 * New, additive endpoint: it never changes the legacy import contract, it only
 * adds the email/provenance guarantees the spreadsheet workflow depends on.
 */
export class RosterImportItemDto {
  @ApiProperty({ description: 'Tên đội / cặp đấu hoặc tên VĐV' })
  @IsString()
  teamName: string;

  @ApiProperty({ description: 'Họ tên VĐV 1' })
  @IsString()
  player1Name: string;

  @ApiProperty({ description: 'Email VĐV 1 (bắt buộc)' })
  @IsEmail()
  player1Email: string;

  @ApiPropertyOptional({ description: 'SĐT VĐV 1' })
  @IsOptional()
  @IsString()
  player1Phone?: string;

  @ApiPropertyOptional({ description: 'Họ tên VĐV 2 (nếu giải đôi)' })
  @IsOptional()
  @IsString()
  player2Name?: string;

  @ApiPropertyOptional({ description: 'Email VĐV 2' })
  @IsOptional()
  @IsEmail()
  player2Email?: string;

  @ApiPropertyOptional({ description: 'SĐT VĐV 2' })
  @IsOptional()
  @IsString()
  player2Phone?: string;

  @ApiPropertyOptional({ description: 'Điểm trình / ELO khởi tạo' })
  @IsOptional()
  @IsNumber()
  elo?: number;

  @ApiPropertyOptional({ description: 'Đã thanh toán lệ phí hay chưa' })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @ApiPropertyOptional({ description: 'Tự động duyệt hồ sơ (APPROVED)' })
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;

  @ApiPropertyOptional({ description: 'Loại nhập, không cấp quyền wildcard' })
  @IsOptional()
  @IsIn(ROSTER_ENTRY_TYPES)
  entryType?: RosterEntryType;

  @ApiProperty({ description: 'Nguồn nhập dữ liệu', enum: IMPORT_SOURCES })
  @IsIn(IMPORT_SOURCES)
  source: ImportSource;

  @ApiPropertyOptional({ description: 'Tên nội dung thi đấu trên file' })
  @IsOptional()
  @IsString()
  divisionName?: string;

  @ApiPropertyOptional({ description: 'Ghi chú / câu trả lời custom form' })
  @IsOptional()
  @IsObject()
  customResponses?: Record<string, unknown>;
}

export class RosterImportDto {
  @ApiPropertyOptional({ description: 'ID của division / nội dung thi đấu' })
  @IsOptional()
  @IsString()
  divisionId?: string;

  @ApiProperty({
    description: 'Danh sách VĐV / Đội cần nhập',
    type: [RosterImportItemDto],
    maxItems: 200,
  })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RosterImportItemDto)
  participants: RosterImportItemDto[];

  @ApiPropertyOptional({
    description: 'Gửi thông báo trong SportO cho các VĐV đã có tài khoản',
  })
  @IsOptional()
  @IsBoolean()
  notifyLinkedAccounts?: boolean;
}
