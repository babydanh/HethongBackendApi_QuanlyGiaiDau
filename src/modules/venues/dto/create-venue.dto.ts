import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsNumber,
  Min,
  Max,
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

  @ApiPropertyOptional({ example: 10.7769, description: 'Vĩ độ (Latitude)' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    example: 106.7009,
    description: 'Kinh độ (Longitude)',
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
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
