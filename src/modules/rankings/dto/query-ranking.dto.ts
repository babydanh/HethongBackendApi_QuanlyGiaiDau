import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, IsUUID, IsString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryRankingDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 50, description: 'Số lượng / trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @ApiProperty({
    example: 'uuid-category',
    description: 'Bắt buộc lọc theo Category',
  })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ example: 'SINGLES', description: 'Thể loại thi đấu (SINGLES/DOUBLES/MIXED_DOUBLES)' })
  @IsOptional()
  @IsString()
  matchType?: string;

  @ApiPropertyOptional({ example: 'PUBLIC', description: 'Scope của bảng xếp hạng (PUBLIC/COMMUNITY)', enum: ['PUBLIC', 'COMMUNITY'] })
  @IsOptional()
  @IsString()
  @IsIn(['PUBLIC', 'COMMUNITY'])
  scope?: 'PUBLIC' | 'COMMUNITY' = 'PUBLIC';

  @ApiPropertyOptional({ example: 'uuid-community', description: 'Lọc theo Community (bắt buộc khi scope = COMMUNITY)' })
  @IsOptional()
  @IsUUID()
  communityId?: string;

  @ApiPropertyOptional({ example: '79', description: 'Lọc theo mã tỉnh/thành phố (Khu vực)' })
  @IsOptional()
  @IsString()
  provinceCode?: string;
}
