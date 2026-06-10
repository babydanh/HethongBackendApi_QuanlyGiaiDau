import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max, IsUUID, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

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
}

