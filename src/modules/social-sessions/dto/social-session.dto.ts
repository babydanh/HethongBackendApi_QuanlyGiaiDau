import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
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
} from 'class-validator';

export const SOCIAL_SPORTS = ['tennis', 'pickleball', 'badminton'] as const;
export type SocialSport = (typeof SOCIAL_SPORTS)[number];

export const SOCIAL_VISIBILITIES = ['PUBLIC', 'CLUB_ONLY'] as const;
export type SocialVisibility = (typeof SOCIAL_VISIBILITIES)[number];

export const SOCIAL_PLAY_FORMATS = [
  'Giao lưu',
  'Đánh vòng tròn',
  'Đánh đơn',
  'Đánh đôi',
] as const;

export class CreateSocialSessionDto {
  @ApiPropertyOptional({ description: 'ID Club (communities.id). Bỏ trống = kèo cá nhân' })
  @IsUUID()
  @IsOptional()
  communityId?: string;

  @ApiProperty({ enum: SOCIAL_SPORTS, description: 'Môn thể thao (map qua categories.slug)' })
  @IsIn([...SOCIAL_SPORTS])
  sport: SocialSport;

  @ApiProperty({ example: 'Pickleball Giao hữu với Bảo', maxLength: 100 })
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiPropertyOptional({ description: 'Ghi chú / lưu ý' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: SOCIAL_PLAY_FORMATS, default: 'Giao lưu' })
  @IsIn([...SOCIAL_PLAY_FORMATS])
  @IsOptional()
  playFormat?: string;

  @ApiProperty({ example: '2026-09-17T14:45:00+07:00', description: 'Giờ bắt đầu (ISO)' })
  @IsDateString()
  startAt: string;

  @ApiPropertyOptional({ example: 120, description: 'Thời lượng (phút). Hỗ trợ 90 cho kèo 1.5h' })
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(480)
  @IsOptional()
  durationMinutes?: number;

  @ApiProperty({ example: '22 Cộng Hòa', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  venueName: string;

  @ApiProperty({ example: '22 Cộng Hòa, Tân Bình, TP. Hồ Chí Minh', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  venueAddress: string;

  @ApiPropertyOptional({ example: 6, minimum: 2, maximum: 64 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(64)
  @IsOptional()
  maxSlots?: number;

  @ApiPropertyOptional({ example: 50000, description: 'Giá 1 vé (VND, 0 = miễn phí)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000000)
  @IsOptional()
  feePerSlot?: number;

  @ApiPropertyOptional({ example: 'ALL', maxLength: 50 })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  levelRequirement?: string;

  @ApiPropertyOptional({ enum: SOCIAL_VISIBILITIES, default: 'PUBLIC' })
  @IsIn([...SOCIAL_VISIBILITIES])
  @IsOptional()
  visibility?: SocialVisibility;

  @ApiPropertyOptional({ example: '0988112233', maxLength: 20 })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'https://zalo.me/g/sb-pickleball' })
  @IsUrl()
  @IsOptional()
  zaloGroupUrl?: string;
}

export class UpdateSocialSessionDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: SOCIAL_PLAY_FORMATS })
  @IsIn([...SOCIAL_PLAY_FORMATS])
  @IsOptional()
  playFormat?: string;

  @ApiPropertyOptional({ description: 'Giờ bắt đầu mới (ISO). play_date tự suy ra' })
  @IsDateString()
  @IsOptional()
  startAt?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(480)
  @IsOptional()
  durationMinutes?: number;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  venueName?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  venueAddress?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(64)
  @IsOptional()
  maxSlots?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000000)
  @IsOptional()
  feePerSlot?: number;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  levelRequirement?: string;

  @ApiPropertyOptional({ enum: SOCIAL_VISIBILITIES })
  @IsIn([...SOCIAL_VISIBILITIES])
  @IsOptional()
  visibility?: SocialVisibility;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsUrl()
  @IsOptional()
  zaloGroupUrl?: string;

  @ApiPropertyOptional({ enum: ['OPEN', 'FULL', 'COMPLETED', 'CANCELLED'] })
  @IsIn(['OPEN', 'FULL', 'COMPLETED', 'CANCELLED'])
  @IsOptional()
  status?: 'OPEN' | 'FULL' | 'COMPLETED' | 'CANCELLED';
}

export class QuerySocialSessionsDto {
  @ApiProperty({ example: '2026-09-17', description: 'Ngày chơi (YYYY-MM-DD)' })
  @IsString()
  date: string;

  @ApiPropertyOptional({ enum: SOCIAL_SPORTS })
  @IsIn([...SOCIAL_SPORTS])
  @IsOptional()
  sport?: SocialSport;

  @ApiPropertyOptional({ description: 'Lọc theo Club' })
  @IsUUID()
  @IsOptional()
  communityId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}

export class JoinSocialSessionDto {
  @ApiPropertyOptional({ example: 1, description: 'Số vé muốn giữ (mặc định 1)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  @IsOptional()
  ticketCount?: number;
}

export class AddSocialParticipantDto {
  @ApiProperty({ description: 'User được thêm (phải có tài khoản)' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  @IsOptional()
  ticketCount?: number;
}

export class UpdateSocialPaymentDto {
  @ApiProperty({ enum: ['UNPAID', 'PAID', 'PENDING'] })
  @IsIn(['UNPAID', 'PAID', 'PENDING'])
  paymentStatus: 'UNPAID' | 'PAID' | 'PENDING';
}
