import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const AD_PLACEMENT_SLOTS = [
  'HOMEPAGE_SIDEBAR',
  'TOURNAMENTS_BOTTOM',
  'MATCHES_BOTTOM',
  'GLOBAL_HEADER',
  'APP_HOME_FEED',
  'APP_MATCHES_BOTTOM',
  'APP_COMMUNITY_FEED',
  'APP_TOURNAMENT_DETAIL',
] as const;

export type AdPlacementSlot = (typeof AD_PLACEMENT_SLOTS)[number];

export const AD_BANNER_TYPES = ['IMAGE_LINK', 'CUSTOM_HTML'] as const;
export type AdBannerType = (typeof AD_BANNER_TYPES)[number];

export class CreateAdvertisementDto {
  @ApiProperty({ example: 'Khuyến mãi hè SportO Store' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({ example: 'Giảm giá 20% cho tất cả vợt Pickleball và Cầu lông' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: AD_BANNER_TYPES, default: 'IMAGE_LINK' })
  @IsOptional()
  @IsIn(AD_BANNER_TYPES)
  bannerType?: AdBannerType;

  @ApiPropertyOptional({ example: 'https://cdn.sporto.asia/banners/summer-sale.jpg' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  imageUrl?: string;

  @ApiPropertyOptional({ example: 'https://sporto.asia/store/sale' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  targetUrl?: string;

  @ApiPropertyOptional({ example: 'Khám phá ngay' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ctaText?: string;

  @ApiPropertyOptional({ example: '<ins class="adsbygoogle" ...></ins>' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  customHtml?: string;

  @ApiProperty({ enum: AD_PLACEMENT_SLOTS, example: 'HOMEPAGE_SIDEBAR' })
  @IsIn(AD_PLACEMENT_SLOTS)
  placementSlot!: AdPlacementSlot;

  @ApiPropertyOptional({ description: 'Optional sport/category target. Null means all sports.' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 9999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  displayOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-08-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
