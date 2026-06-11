import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  IsDateString,
  Min,
  IsObject,
  IsIn,
} from 'class-validator';

export class PsrPointConfigDto {
  @ApiProperty({
    example: { 1: 100, 2: 75, 3: 50, 5: 30, 9: 15, 17: 5 },
    description: 'Bản đồ thứ hạng sang điểm số PSR',
  })
  @IsObject()
  pointsByRank: Record<number, number>;

  @ApiProperty({
    example: 2,
    description: 'Thứ hạng tối thiểu được Vé Thẳng (Vô địch & Á quân = 2)',
  })
  @IsNumber()
  @Min(1)
  directEntryThreshold: number;

  @ApiProperty({
    example: 16,
    description: 'Số lượng vé vớt dựa trên điểm PSR',
  })
  @IsNumber()
  @Min(0)
  wildcardCount: number;

  @ApiProperty({
    example: true,
    description: 'Có áp dụng Exclusion Rule không',
  })
  exclusionRule: boolean;

  @ApiProperty({
    example: 'CATEGORY',
    description: 'Phạm vi khóa đăng ký: CATEGORY hoặc ALL',
    enum: ['CATEGORY', 'ALL'],
  })
  @IsString()
  @IsIn(['CATEGORY', 'ALL'])
  exclusionScope: 'CATEGORY' | 'ALL';

  @ApiProperty({
    example: 'Luật tính điểm chuẩn Superstar Cup',
    description: 'Mô tả luật tính điểm',
  })
  @IsString()
  description: string;
}

export class CreateSeriesDto {
  @ApiProperty({
    example: 'Đường đến Superstars Cup 2026',
    description: 'Tên chuỗi giải đấu (Series)',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'superstars-cup-2026',
    description: 'Slug SEO-friendly độc nhất',
  })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiPropertyOptional({
    example: 'Mô tả chi tiết về chuỗi giải đấu',
    description: 'Mô tả chi tiết bằng HTML',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'https://...', description: 'Banner URL của chuỗi giải' })
  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @ApiPropertyOptional({ example: 'https://...', description: 'Logo URL của chuỗi giải' })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00Z', description: 'Ngày bắt đầu chặng 1' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00Z', description: 'Ngày kết thúc chuỗi giải' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: 500000000, description: 'Tổng giải thưởng của cả chuỗi' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  totalPrize?: number;

  @ApiProperty({
    type: PsrPointConfigDto,
    description: 'Cấu hình luật và tính điểm PSR của chuỗi',
  })
  @IsObject()
  rules: PsrPointConfigDto;

  @ApiPropertyOptional({
    example: 'PUBLIC',
    description: 'Chế độ hiển thị: PUBLIC hoặc PRIVATE',
    enum: ['PUBLIC', 'PRIVATE'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['PUBLIC', 'PRIVATE'])
  visibility?: 'PUBLIC' | 'PRIVATE';
}
