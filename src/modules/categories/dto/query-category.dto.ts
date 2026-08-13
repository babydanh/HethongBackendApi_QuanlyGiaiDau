import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryCategoryDto {
  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm theo tên hoặc slug',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Bao gồm cả các môn đã ẩn (Mặc định: false)',
  })
  @IsOptional()
  includeInactive?: boolean | string;
}
