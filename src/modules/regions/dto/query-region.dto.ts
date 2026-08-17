import { IsOptional, IsString, IsNotEmpty } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class QueryRegionDto {
  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm theo tên' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class QueryDistrictDto extends QueryRegionDto {
  @ApiProperty({ description: 'Mã tỉnh/thành phố' })
  @IsNotEmpty()
  @IsString()
  provinceCode: string;
}

export class QueryWardDto extends QueryRegionDto {
  @ApiPropertyOptional({ description: 'Mã tỉnh/thành phố (chuẩn v2)' })
  @IsOptional()
  @IsString()
  provinceCode?: string;

  @ApiPropertyOptional({ description: 'Mã quận/huyện (legacy v1)' })
  @IsOptional()
  @IsString()
  districtCode?: string;
}
