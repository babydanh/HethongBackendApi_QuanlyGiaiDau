import { Type } from 'class-transformer';
import {
  IsInt,
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

  @ApiPropertyOptional({ description: 'Số lượng tối đa', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class QueryWardDto extends QueryRegionDto {
  @ApiPropertyOptional({ description: 'Mã tỉnh/thành phố' })
  @IsOptional()
  @IsString()
  provinceCode?: string;
}

export class SearchRegionsDto {
  @ApiPropertyOptional({ description: 'Từ khóa tìm cả tỉnh và phường/xã' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Số lượng tối đa', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** Tra phường chứa một điểm toạ độ (chiều ghim → địa chỉ). */
export class QueryResolveDto {
  @ApiProperty({ description: 'Vĩ độ', example: 10.7607 })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ description: 'Kinh độ', example: 106.6247 })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
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

/**
 * Hình dạng trả về của `GET /regions/resolve` và `GET /regions/wards/centroid`.
 *
 * `isEstimated` là cờ BẮT BUỘC phải có, vì hai nhánh tra phường trả ra cùng
 * một hình dạng: một nhánh chắc chắn, một nhánh chỉ là đoán. Không có cờ thì
 * client không phân biệt được "phường chứa điểm" với "phường gần điểm nhất",
 * và nhánh đoán sẽ tự xác nhận chính nó: ghim tự đặt ở tâm phường N thì tra
 * ngược lại ra đúng phường N (khoảng cách 0) — nhìn thì hoàn hảo tự nhất quán
 * mà hoàn toàn không có căn cứ. Ở khu vực đông (phường HCM cách nhau ~500 m)
 * một ghim sát ranh giới còn khớp nhầm sang phường bên cạnh mà không có tín
 * hiệu gì báo cho host biết.
 *
 * Trường thêm vào sau, không đổi tên và không bỏ trường cũ: app đang chạy
 * đã deploy dùng endpoint này.
 */
export class ResolvedRegionDto {
  @ApiProperty({ description: 'Mã phường/xã', example: '01-001' })
  wardCode!: string;

  @ApiProperty({ description: 'Tên phường/xã', example: 'Phường Mỹ Đình' })
  wardName!: string;

  @ApiProperty({
    description: 'Vĩ độ tâm phường, null khi phường chưa có tâm trong danh mục',
    nullable: true,
    type: Number,
    example: 21.0278,
  })
  centerLat!: number | null;

  @ApiProperty({
    description: 'Kinh độ tâm phường, null khi phường chưa có tâm trong danh mục',
    nullable: true,
    type: Number,
    example: 105.8342,
  })
  centerLng!: number | null;

  @ApiProperty({ description: 'Mã tỉnh/thành phố', example: '01' })
  provinceCode!: string;

  @ApiProperty({ description: 'Tên tỉnh/thành phố', example: 'Hà Nội' })
  provinceName!: string;

  @ApiProperty({
    description:
      'true = center tham chiếu; false = polygon bao phủ điểm.',
    example: false,
  })
  isEstimated!: boolean;
}
