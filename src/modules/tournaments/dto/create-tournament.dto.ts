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
  IsIn,
  IsArray,
  IsBoolean,
} from 'class-validator';

export class CreateTournamentDto {
  @ApiProperty({
    example: 'CLUB',
    description: 'Loại giải đấu: CLUB hoặc PUBLIC',
    enum: ['CLUB', 'PUBLIC'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['CLUB', 'PUBLIC'])
  tournamentType: 'CLUB' | 'PUBLIC';

  @ApiPropertyOptional({
    example: 'DOUBLES',
    description: 'Hình thức thi đấu: SINGLES, DOUBLES, MIXED_DOUBLES',
    enum: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'])
  matchType?: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';

  @ApiPropertyOptional({ example: 'https://...', description: 'Banner giải đấu' })
  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @ApiPropertyOptional({ example: 'https://...', description: 'Logo giải đấu' })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: ['https://...'], description: 'Ảnh gallery (chỉ giải PUBLIC)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  galleryImages?: string[];

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00Z', description: 'Ngày mở đăng ký' })
  @IsDateString()
  @IsOptional()
  registrationStartDate?: string;

  @ApiPropertyOptional({ example: '2026-10-14T00:00:00Z', description: 'Ngày đóng đăng ký' })
  @IsDateString()
  @IsOptional()
  registrationEndDate?: string;

  @ApiPropertyOptional({ example: 16, description: 'Số đội/VĐV tối đa' })
  @IsNumber()
  @IsOptional()
  @Min(2)
  maxParticipants?: number;

  @ApiPropertyOptional({ example: 'Tổng giải thưởng 10tr', description: 'Mô tả giải thưởng' })
  @IsString()
  @IsOptional()
  prizeDescription?: string;

  @ApiPropertyOptional({ example: [], description: 'Giải thưởng chi tiết' })
  @IsOptional()
  prizes?: Record<string, unknown>[];

  @ApiPropertyOptional({ example: {}, description: 'Thông tin liên hệ BTC' })
  @IsOptional()
  contactInfo?: Record<string, string>;

  @ApiPropertyOptional({
    example: 'PUBLIC',
    description: 'Chế độ hiển thị: PUBLIC hoặc PRIVATE',
    enum: ['PUBLIC', 'PRIVATE'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['PUBLIC', 'PRIVATE'])
  visibility?: 'PUBLIC' | 'PRIVATE';

  @ApiPropertyOptional({
    example: 'MIXED',
    description: 'Ràng buộc giới tính: MALE, FEMALE, MIXED',
    enum: ['MALE', 'FEMALE', 'MIXED'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'MIXED'])
  genderRestriction?: 'MALE' | 'FEMALE' | 'MIXED' | null;

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

  @ApiPropertyOptional({
    example: { format: 'Singles', setsToWin: 2 },
    description: 'Cấu hình luật chơi thể thao',
  })
  @IsObject()
  @IsOptional()
  sportRules?: Record<string, unknown>;

  @ApiProperty({
    example: { bracketType: 'SINGLE_ELIMINATION', maxTeams: 16 },
    description: 'Cấu hình giải đấu',
  })
  @IsObject()
  tournamentConfig: Record<string, unknown>;

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

  @ApiPropertyOptional({
    example: 'uuid-parent-tournament',
    description: 'ID giải đấu cha (chuỗi giải đấu / nhiều thể loại)',
  })
  @IsUUID()
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({
    example: 'Hải Dương',
    description: 'Tỉnh/Thành phố diễn ra giải đấu',
  })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: true, description: 'Giải đấu có tính điểm ELO/hạng không' })
  @IsBoolean()
  @IsOptional()
  isRanked?: boolean;
}
