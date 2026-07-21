import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max, IsUUID, IsIn } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class QueryTournamentDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 10,
    description: 'Số lượng / trang (Tối đa 50)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'Hà Nội', description: 'Từ khóa tìm kiếm' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'uuid-category',
    description: 'Lọc theo môn thể thao',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'UPCOMING',
    description: 'Lọc theo trạng thái',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    example: 'CLUB',
    description: 'Lọc theo loại giải đấu: CLUB hoặc PUBLIC',
    enum: ['CLUB', 'PUBLIC'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['CLUB', 'PUBLIC'])
  tournamentType?: 'CLUB' | 'PUBLIC';

  @ApiPropertyOptional({
    example: 'DOUBLES',
    description: 'Lọc theo hình thức thi đấu: SINGLES, DOUBLES, MIXED_DOUBLES',
    enum: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'])
  matchType?: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';

  @ApiPropertyOptional({
    example: 'uuid-community',
    description: 'Lọc theo ID cộng đồng',
  })
  @IsOptional()
  @IsUUID()
  communityId?: string;

  @ApiPropertyOptional({
    example: 'PUBLIC',
    description: 'Lọc theo chế độ hiển thị: PUBLIC hoặc PRIVATE',
    enum: ['PUBLIC', 'PRIVATE'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['PUBLIC', 'PRIVATE'])
  visibility?: 'PUBLIC' | 'PRIVATE';

  @ApiPropertyOptional({ example: 'Hồ Chí Minh', description: 'Lọc theo khu vực/tỉnh thành' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ example: 'uuid-user', description: 'Lọc theo ID người tạo' })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({ example: '2026-07-15', description: 'Lọc từ ngày bắt đầu giải đấu' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-07-30', description: 'Lọc đến ngày kết thúc giải đấu' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    example: 'GROUP_STAGE_KNOCKOUT',
    description: 'Lọc theo thể thức thi đấu: SINGLE_ELIMINATION, DOUBLE_ELIMINATION, ROUND_ROBIN, GROUP_STAGE_KNOCKOUT',
    enum: ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'GROUP_STAGE_KNOCKOUT'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'GROUP_STAGE_KNOCKOUT'])
  bracketType?: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE_KNOCKOUT';

  @ApiPropertyOptional({
    example: 'MALE',
    description: 'Lọc theo giới tính: MALE, FEMALE, MIXED',
    enum: ['MALE', 'FEMALE', 'MIXED'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['MALE', 'FEMALE', 'MIXED'])
  genderRestriction?: 'MALE' | 'FEMALE' | 'MIXED';

  @ApiPropertyOptional({
    description: 'Lọc giải đấu xếp hạng ELO hoặc phong trào',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isRanked?: boolean;
}

