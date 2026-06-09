import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateGalleryItemDto {
  @ApiProperty({ description: 'URL của ảnh' })
  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @ApiPropertyOptional({ description: 'Mô tả ảnh' })
  @IsString()
  @IsOptional()
  caption?: string;
}
