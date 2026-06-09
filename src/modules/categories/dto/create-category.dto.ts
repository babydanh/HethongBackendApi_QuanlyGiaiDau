import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsObject,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Pickleball', description: 'Tên môn thể thao' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    example: 'pickleball',
    description: 'Slug dùng cho URL (viết thường, không dấu)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug chỉ được chứa chữ cái thường, số và dấu gạch ngang',
  })
  slug: string;

  @ApiPropertyOptional({
    example: 'Môn thể thao dùng vợt, bóng nhựa đục lỗ',
    description: 'Mô tả chi tiết',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: { hasSets: true, maxSets: 3 },
    description: 'Cấu hình đặc thù của môn thể thao',
    type: Object,
  })
  @IsObject()
  @IsOptional()
  categoryConfig?: Record<string, any>;
}
