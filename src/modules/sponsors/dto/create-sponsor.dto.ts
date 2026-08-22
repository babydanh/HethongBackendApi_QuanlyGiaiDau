import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const SPONSOR_TIERS = [
  'TITLE',
  'DIAMOND',
  'GOLD',
  'SILVER',
  'BRONZE',
  'IN_KIND',
] as const;

export type SponsorTier = (typeof SPONSOR_TIERS)[number];

export const SPONSOR_STATUSES = ['DRAFT', 'PUBLISHED', 'HIDDEN'] as const;
export type SponsorStatus = (typeof SPONSOR_STATUSES)[number];

export class CreateSponsorDto {
  @ApiProperty({ example: 'Acme Sports' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  displayName!: string;

  @ApiProperty({ enum: SPONSOR_TIERS, example: 'GOLD' })
  @IsIn(SPONSOR_TIERS)
  tier!: SponsorTier;

  @ApiProperty({ example: 'https://cdn.example.com/acme-logo.png' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  logoUrl!: string;

  @ApiPropertyOptional({ example: 'https://acme.example.com' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  websiteUrl?: string;

  @ApiPropertyOptional({ example: 'Đồng hành cùng giải đấu mùa hè.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 9999 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  displayOrder?: number;

  @ApiPropertyOptional({ enum: SPONSOR_STATUSES, default: 'DRAFT' })
  @IsOptional()
  @IsIn(SPONSOR_STATUSES)
  status?: SponsorStatus;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional({ example: '2026-08-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  endAt?: string;
}
