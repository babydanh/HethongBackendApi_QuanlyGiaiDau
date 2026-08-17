import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryRegionDto {
  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm theo tên' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class QueryWardDto extends QueryRegionDto {
  @ApiPropertyOptional({ description: 'Mã tỉnh/thành phố' })
  @IsOptional()
  @IsString()
  provinceCode?: string;
}
