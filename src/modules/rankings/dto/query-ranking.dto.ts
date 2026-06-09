import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, IsUUID, IsString } from 'class-validator';
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

  @ApiPropertyOptional({ example: 'SINGLES', description: 'Thể loại thi đấu (SINGLES/DOUBLES)' })
  @IsOptional()
  @IsString()
  matchType?: string;

  @ApiPropertyOptional({ example: 'uuid-community', description: 'Lọc theo Community (nếu trống thì lấy Global)' })
  @IsOptional()
  @IsUUID()
  communityId?: string;
}
