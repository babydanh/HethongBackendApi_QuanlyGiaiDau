import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsDateString,
  IsOptional,
  IsUUID,
  IsNumber,
  IsObject,
} from 'class-validator';

export class CreateLegDto {
  @ApiProperty({ example: 'Chặng 1: Vòng loại', description: 'Tên chặng đấu' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 1, description: 'Thứ tự chặng đấu' })
  @IsInt()
  @Min(1)
  order: number;

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00Z', description: 'Ngày bắt đầu chặng' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-07-31T00:00:00Z', description: 'Ngày kết thúc chặng' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: 2, description: 'Số suất vé thẳng cho top đầu mỗi sự kiện' })
  @IsInt()
  @Min(0)
  @IsOptional()
  directEntrySlots?: number;

  @ApiPropertyOptional({ example: 16, description: 'Số suất vé vớt tích lũy PSR cuối chặng' })
  @IsInt()
  @Min(0)
  @IsOptional()
  wildcardSlots?: number;

  @ApiPropertyOptional({ description: 'Cấu hình ghi đè luật PSR cho chặng này (tùy chọn)' })
  @IsObject()
  @IsOptional()
  rulesOverride?: Record<string, unknown>;
}

export class LinkEventDto {
  @ApiProperty({ example: 'uuid-tournament', description: 'ID giải đấu độc lập cần liên kết' })
  @IsUUID()
  @IsNotEmpty()
  tournamentId: string;

  @ApiPropertyOptional({ example: 'Tây Nguyên', description: 'Khu vực địa lý diễn ra giải' })
  @IsString()
  @IsOptional()
  region?: string;

  @ApiProperty({ example: 1, description: 'Thứ tự của giải đấu trong chặng' })
  @IsInt()
  @Min(1)
  order: number;

  @ApiPropertyOptional({ example: 1.0, description: 'Hệ số điểm PSR của giải (ví dụ 1.0, 1.5)' })
  @IsNumber()
  @IsOptional()
  @Min(0.1)
  pointMultiplier?: number;
}
