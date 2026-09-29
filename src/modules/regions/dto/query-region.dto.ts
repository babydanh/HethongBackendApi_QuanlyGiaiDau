import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

/** Tra phường chứa một điểm toạ độ (chiều ghim → địa chỉ). */
export class QueryResolveDto {
  @ApiProperty({ description: 'Vĩ độ', example: 10.7607 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ description: 'Kinh độ', example: 106.6247 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;
}

/** Tâm hình học của một phường (chiều địa chỉ → ghim). */
export class QueryCentroidDto {
  @ApiProperty({ description: 'Mã tỉnh/thành phố', example: '79' })
  @IsString()
  @IsNotEmpty()
  provinceCode!: string;

  @ApiProperty({ description: 'Mã phường/xã', example: '27349' })
  @IsString()
  @IsNotEmpty()
  wardCode!: string;
}
