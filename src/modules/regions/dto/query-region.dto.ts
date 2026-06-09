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
  @ApiProperty({ description: 'Mã quận/huyện' })
  @IsNotEmpty()
  @IsString()
  districtCode: string;
}
