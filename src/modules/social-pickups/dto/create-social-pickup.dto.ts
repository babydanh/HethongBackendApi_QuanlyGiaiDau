import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsArray,
  IsString,
  IsUUID,
  IsUrl,
  ArrayMaxSize,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSocialPickupDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ minLength: 3, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: '2026-09-25', description: 'Lịch Việt Nam' })
  @IsDateString({ strict: true })
  playDate!: string;

  @ApiProperty({ example: '19:30' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({ example: '21:30' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @ApiProperty({ minLength: 2, maxLength: 255 })
  @IsString()
  @MaxLength(255)
  location!: string;

  @ApiPropertyOptional({ example: '79', description: 'Mã tỉnh/thành từ API địa giới Việt Nam' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  provinceCode?: string;

  @ApiPropertyOptional({ example: '760', description: 'Mã phường/xã từ API địa giới Việt Nam' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  wardCode?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 4, description: 'Ảnh tùy chọn đã tải lên từ upload service' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  venueId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  courtId?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 10000000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  feePerSlot?: number;

  @ApiProperty({ minimum: 2, maximum: 128, default: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(128)
  maxSlots!: number;

  @ApiPropertyOptional({ maxLength: 50, default: 'ALL' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  levelRequirement?: string;

  @ApiPropertyOptional({ enum: ['ANY', 'MALE', 'FEMALE', 'MIXED'], default: 'ANY' })
  @IsOptional()
  @IsIn(['ANY', 'MALE', 'FEMALE', 'MIXED'])
  genderRequirement?: string;
}
