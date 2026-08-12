import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class QueryCommunityDto extends CursorPaginationDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 10,
    description: 'Số lượng / trang (Tối đa 50)',
  })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
  @ApiPropertyOptional({ description: 'Tìm kiếm theo tên' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Lấy tất cả không giới hạn status' })
  @IsOptional()
  all?: boolean | string;

  @ApiPropertyOptional({
    enum: ['ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'INACTIVE', 'DEACTIVATED', 'SUSPENDED'],
    description: 'Lọc theo trạng thái',
  })
  @IsString()
  @IsIn(['ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'INACTIVE', 'DEACTIVATED', 'SUSPENDED'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Vĩ độ để tìm quanh đây' })
  @IsLatitude()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ description: 'Kinh độ để tìm quanh đây' })
  @IsLongitude()
  @IsOptional()
  lng?: number;

  @ApiPropertyOptional({ description: 'Bán kính tìm kiếm (km)', default: 10 })
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsOptional()
  radiusKm?: number;

  @ApiPropertyOptional({ example: 'Hồ Chí Minh', description: 'Lọc theo khu vực/tỉnh thành' })
  @IsString()
  @IsOptional()
  region?: string;

  @ApiPropertyOptional({ description: 'Lọc theo ID môn thể thao' })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo mã tỉnh thành' })
  @IsString()
  @IsOptional()
  provinceCode?: string;
}
