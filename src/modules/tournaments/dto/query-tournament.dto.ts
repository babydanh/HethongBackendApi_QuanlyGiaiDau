import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max, IsUUID } from 'class-validator';
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
}
