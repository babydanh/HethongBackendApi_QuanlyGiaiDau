import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  IsDateString,
  Min,
  Max,
  IsObject,
} from 'class-validator';

export class CreateTournamentDto {
  @ApiProperty({
    example: 'Giải Quần Vợt Mùa Thu 2026',
    description: 'Tên giải đấu',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'uuid-category',
    description: 'ID môn thể thao (Category)',
  })
  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional({
    example: 'uuid-community',
    description: 'ID cộng đồng tổ chức (nếu có)',
  })
  @IsUUID()
  @IsOptional()
  communityId?: string;

  @ApiPropertyOptional({
    example: 'Mô tả chi tiết giải đấu',
    description: 'Mô tả giải đấu',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: { format: 'Singles', setsToWin: 2 },
    description: 'Cấu hình luật chơi thể thao',
  })
  @IsObject()
  sportRules: any;

  @ApiProperty({
    example: { bracketType: 'SINGLE_ELIMINATION', maxTeams: 16 },
    description: 'Cấu hình giải đấu',
  })
  @IsObject()
  tournamentConfig: any;

  @ApiPropertyOptional({ example: 500000, description: 'Phí tham gia' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  entryFee?: number;

  @ApiPropertyOptional({ example: 5.0, description: 'Phần trăm phí nền tảng' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  platformFeePercentage?: number;

  @ApiPropertyOptional({
    example: '2026-10-15T00:00:00Z',
    description: 'Ngày bắt đầu',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-10-30T00:00:00Z',
    description: 'Ngày kết thúc',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({
    example: 'uuid-venue',
    description: 'ID địa điểm thi đấu',
  })
  @IsUUID()
  @IsOptional()
  venueId?: string;
}
