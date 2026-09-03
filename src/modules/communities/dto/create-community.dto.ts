import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCommunityDto {
  @ApiProperty({
    example: 'CLB Pickleball Hà Nội',
    description: 'Tên cộng đồng',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: 'Nơi giao lưu học hỏi',
    description: 'Mô tả chi tiết',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'URL logo' })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'URL ảnh bìa' })
  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @ApiPropertyOptional({
    example: 'Quận Cầu Giấy, Hà Nội',
    description: 'Địa chỉ',
  })
  @IsString()
  @IsOptional()
  locationAddress?: string;

  @ApiPropertyOptional({ example: 21.028511, description: 'Vĩ độ' })
  @IsLatitude()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ example: 105.804817, description: 'Kinh độ' })
  @IsLongitude()
  @IsOptional()
  lng?: number;

  @ApiProperty({
    type: [String],
    description: 'Đúng một ID môn thể thao chính của CLB',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  @IsUUID('4', { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ description: 'Mã tỉnh/thành phố' })
  @IsString()
  @IsOptional()
  provinceCode?: string;

  @ApiPropertyOptional({ description: 'Mã quận/huyện' })
  @IsString()
  @IsOptional()
  districtCode?: string;

  @ApiPropertyOptional({ description: 'Mã phường/xã' })
  @IsString()
  @IsOptional()
  wardCode?: string;

  @ApiPropertyOptional({ description: 'Chế độ hiển thị', enum: ['PUBLIC', 'PRIVATE', 'RESTRICTED'] })
  @IsString()
  @IsOptional()
  visibility?: 'PUBLIC' | 'PRIVATE' | 'RESTRICTED';

  @ApiPropertyOptional({ description: 'Chế độ tham gia', enum: ['OPEN', 'APPROVAL', 'INVITE_ONLY'] })
  @IsString()
  @IsOptional()
  joinMode?: 'OPEN' | 'APPROVAL' | 'INVITE_ONLY';

  @ApiPropertyOptional({ description: 'Câu hỏi xin vào' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  joinQuestions?: string[];

  @ApiPropertyOptional({ description: 'Nội quy cộng đồng' })
  @IsString()
  @IsOptional()
  rules?: string;

  @ApiPropertyOptional({ description: 'Giới hạn thành viên' })
  @IsOptional()
  maxMembers?: number;

  @ApiPropertyOptional({
    type: Object,
    description: 'Liên kết mạng xã hội (facebook, zalo, instagram, v.v.)',
  })
  @IsOptional()
  socialLinks?: Record<string, string>;
}
