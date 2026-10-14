import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

/**
 * Các slot cột của danh sách VĐV mà một cột Excel có thể được ánh xạ tới.
 *
 * Nguồn gốc: `ROSTER_COLUMN_SLOTS` ở web app (`HethongFrontEndWeb_QLgiaidau/src/utils/exportTournament.ts`).
 * Web app là nguồn chuẩn cho các slot; model chỉ được chọn trong danh sách này, mọi giá trị khác bị loại.
 */
export const ROSTER_LAYOUT_SLOTS = [
  'teamName',
  'player1Name',
  'player1Email',
  'player1Phone',
  'player2Name',
  'player2Email',
  'player2Phone',
  'divisionName',
  'elo',
  'isPaid',
  'notes',
] as const;

export type RosterLayoutSlot = (typeof ROSTER_LAYOUT_SLOTS)[number];

/** Cách ghép cặp đôi trong một khối. */
export const ROSTER_LAYOUT_PAIR_LAYOUTS = ['SINGLE', 'COLUMNS', 'SAME_CELL', 'CONSECUTIVE_ROWS'] as const;

export type RosterPairLayout = (typeof ROSTER_LAYOUT_PAIR_LAYOUTS)[number];

/** Loại nội dung của một trang tính. */
export const ROSTER_LAYOUT_SHEET_KINDS = ['ROSTER', 'BRACKET', 'SCHEDULE', 'OTHER'] as const;

export type RosterLayoutSheetKind = (typeof ROSTER_LAYOUT_SHEET_KINDS)[number];

/** Tổng số ký tự tối đa của một trang tính được phép gửi lên model. */
export const ROSTER_LAYOUT_CELL_BUDGET = 20_000;

/** Email thô: payload còn chứa mẫu này sau bước che của trình duyệt sẽ bị từ chối (không dùng cờ `g` để tránh lastIndex). */
export const ROSTER_LAYOUT_EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** SĐT thô (9–14 chữ số, cho phép khoảng trắng, dấu chấm, gạch ngang): payload còn chứa mẫu này sẽ bị từ chối. */
export const ROSTER_LAYOUT_PHONE_PATTERN = /(?<!\d)\+?\d(?:[\s.-]?\d){8,13}(?!\d)/;

/** Một hàng của trang tính, đã được che PII phía trình duyệt. `cells` theo thứ tự cột, phần tử đầu là cột A. */
export class RosterLayoutRowDto {
  @ApiProperty({ description: 'Số hàng (1-based) trong trang tính', minimum: 1, maximum: 1048576 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1048576)
  r!: number;

  @ApiProperty({ description: 'Nội dung các ô của hàng theo thứ tự cột', type: [String], maxItems: 30 })
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  cells!: string[];
}

/** Một trang tính gửi lên để phân tích bố cục. */
export class RosterLayoutSheetDto {
  @ApiProperty({ description: 'Tên trang tính', maxLength: 31 })
  @IsString()
  @MaxLength(31)
  name!: string;

  @ApiProperty({ description: 'Tổng số hàng của trang tính', minimum: 1, maximum: 1048576 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1048576)
  rowCount!: number;

  @ApiProperty({ description: 'Tổng số cột của trang tính', minimum: 1, maximum: 16384 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(16384)
  columnCount!: number;

  @ApiProperty({ description: 'Các hàng được gửi (có thể chỉ là một phần của trang tính)', type: [RosterLayoutRowDto], maxItems: 400 })
  @IsArray()
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => RosterLayoutRowDto)
  rows!: RosterLayoutRowDto[];
}

/** Yêu cầu phân tích bố cục. Chỉ chứa ô đã được che PII phía trình duyệt; BE vẫn kiểm tra lại. */
export class RosterLayoutRequestDto {
  @ApiProperty({ description: 'Các trang tính (tối đa 10)', type: [RosterLayoutSheetDto], minItems: 1, maxItems: 10 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => RosterLayoutSheetDto)
  sheets!: RosterLayoutSheetDto[];

  @ApiPropertyOptional({
    description: 'Ngôn ngữ cho phần ghi chú do model sinh ra; mặc định tiếng Việt',
    enum: ['vi', 'en'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['vi', 'en'])
  locale?: 'vi' | 'en';

  @ApiPropertyOptional({
    description:
      'Chỉ có ở lần gọi lại duy nhất của web khi lần đầu AI trả lời hợp lệ nhưng không có khối nào dùng được. Chỉ để ghi nhật ký, không đổi kết quả.',
    enum: ['EMPTY_LAYOUT'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['EMPTY_LAYOUT'])
  retryReason?: 'EMPTY_LAYOUT';
}
