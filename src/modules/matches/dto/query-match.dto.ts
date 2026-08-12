import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, IsUUID, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';

import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class QueryMatchDto extends CursorPaginationDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 'uuid-group',
    description: 'Lọc theo Bảng thi đấu (Group)',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    example: 'SCHEDULED',
    description: 'Lọc theo Trạng thái trận đấu',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    example: 'uuid-tournament',
    description: 'Lọc theo Giải đấu (Tournament)',
  })
  @IsOptional()
  @IsUUID()
  tournamentId?: string;

  @ApiPropertyOptional({
    example: 'uuid-tournament',
    description: 'Lọc theo Giải đấu (Tournament) (snake_case)',
  })
  @IsOptional()
  @IsUUID()
  tournament_id?: string;

  @ApiPropertyOptional({
    example: 'uuid-division',
    description: 'Lọc theo phân hạng / nội dung thi đấu',
  })
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @ApiPropertyOptional({
    example: 'uuid-division',
    description: 'Lọc theo phân hạng / nội dung thi đấu (snake_case)',
  })
  @IsOptional()
  @IsUUID()
  division_id?: string;

  @ApiPropertyOptional({
    example: 'uuid-category',
    description: 'Lọc theo danh mục môn thể thao (Category ID)',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'uuid-category',
    description: 'Lọc theo danh mục môn thể thao (Category ID) (snake_case)',
  })
  @IsOptional()
  @IsString()
  category_id?: string;

  @ApiPropertyOptional({
    example: 'uuid-user',
    description: 'Lọc theo User ID tham gia trận đấu',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Chỉ lấy các trận đấu thuộc giải đấu PUBLIC',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  publicOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Chỉ lấy các trận đấu thuộc giải đấu PUBLIC (alias)',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isPublicOnly?: boolean;

  @ApiPropertyOptional({
    example: 'GROUP_STAGE_KNOCKOUT',
    description: 'Lọc theo thể thức thi đấu: SINGLE_ELIMINATION, DOUBLE_ELIMINATION, ROUND_ROBIN, GROUP_STAGE_KNOCKOUT',
    enum: ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'GROUP_STAGE_KNOCKOUT'],
  })
  @IsOptional()
  @IsString()
  bracketType?: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT';

  @ApiPropertyOptional({
    example: '2026-07-20',
    description: 'Lọc trận đấu từ ngày (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-07-25',
    description: 'Lọc trận đấu đến ngày (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    example: 'MALE',
    description: 'Lọc theo giới tính giải đấu (MALE/FEMALE)',
  })
  @IsOptional()
  @IsString()
  genderRestriction?: string;

  @ApiPropertyOptional({
    example: 'SINGLES',
    description: 'Lọc theo hình thức thi đấu (SINGLES/DOUBLES/MIXED_DOUBLES)',
  })
  @IsOptional()
  @IsString()
  matchType?: string;

  @ApiPropertyOptional({
    example: 'Hà Nội',
    description: 'Lọc theo thành phố của giải đấu',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Lọc theo giải đấu xếp hạng (isRanked)',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isRanked?: boolean;
}
