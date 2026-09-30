import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';

export class CreateVenueDto {
  @ApiProperty({
    example: 'Sân Cầu Lông Kỳ Hòa',
    description: 'Tên địa điểm thi đấu',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '238 Đường 3/2, Phường 12, Quận 10, TP.HCM',
    description: 'Địa chỉ cụ thể',
  })
  @IsString()
  @IsNotEmpty()
  locationAddress: string;

  // lat/lng luôn đi cặp: chỉ có một nửa là payload sai, và im lặng bỏ qua nửa
  // còn lại sẽ tạo sân không có toạ độ mà không ai biết vì sao. ValidateIf chặn
  // ở tầng validation thay vì để repository tự quyết.
  @ApiPropertyOptional({ example: 10.7769, description: 'Vĩ độ (Latitude). Đi cặp với longitude' })
  @ValidateIf((o: CreateVenueDto) => o.longitude !== undefined)
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({
    example: 106.7009,
    description: 'Kinh độ (Longitude). Đi cặp với latitude',
  })
  @ValidateIf((o: CreateVenueDto) => o.latitude !== undefined)
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({
    example: ['https://example.com/image1.jpg'],
    description: 'Danh sách URL hình ảnh của sân',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imagesUrls?: string[];
}
