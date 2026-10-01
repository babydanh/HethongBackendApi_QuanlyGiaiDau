import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const SOCIAL_VISIBILITIES = ['PUBLIC', 'CLUB_ONLY'] as const;
export type SocialVisibility = (typeof SOCIAL_VISIBILITIES)[number];
export const SOCIAL_GENDER_REQUIREMENTS = [
  'ANY',
  'MALE',
  'FEMALE',
  'MIXED',
] as const;
export type SocialGenderRequirement =
  (typeof SOCIAL_GENDER_REQUIREMENTS)[number];

export const SOCIAL_PLAY_FORMATS = [
  'Giao lưu',
  'Đánh vòng tròn',
  'Đánh đơn',
  'Đánh đôi',
] as const;

export class CreateSocialSessionDto {
  @ApiPropertyOptional({
    description: 'ID Club (communities.id). Bỏ trống = kèo cá nhân',
  })
  @IsUUID()
  @IsOptional()
  communityId?: string;

  @ApiProperty({
    type: String,
    example: 'football',
    description: 'Môn thể thao đang hoạt động (map qua categories.slug)',
  })
  @IsString()
  sport: string;

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

  @ApiProperty({
    example: '2026-09-17T14:45:00+07:00',
    description: 'Giờ bắt đầu (ISO)',
  })
  @IsDateString()
  startAt: string;

  @ApiPropertyOptional({
    example: 120,
    description: 'Thời lượng (phút). Hỗ trợ 90 cho kèo 1.5h',
  })
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

  @ApiProperty({
    example: '22 Cộng Hòa, Tân Bình, TP. Hồ Chí Minh',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  venueAddress: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'ID địa điểm lấy từ GET /venues',
  })
  @IsUUID()
  @IsOptional()
  venueId?: string;

  @ApiPropertyOptional({
    example: '79',
    description: 'Mã tỉnh/thành phố (suy ra từ địa chỉ hoặc từ pin)',
  })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  provinceCode?: string;

  @ApiPropertyOptional({
    example: '27349',
    description: 'Mã phường/xã (suy ra từ địa chỉ hoặc từ pin)',
  })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  wardCode?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'ID sân thuộc venueId đã chọn',
  })
  @IsUUID()
  @IsOptional()
  courtId?: string;

  @ApiPropertyOptional({ enum: SOCIAL_GENDER_REQUIREMENTS, default: 'ANY' })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn([...SOCIAL_GENDER_REQUIREMENTS])
  genderRequirement?: SocialGenderRequirement;

  @ApiProperty({ example: 10.7769, description: 'Vĩ độ sân do host xác nhận; bắt buộc cho Social mới' })
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? value : Number(value)))
  @IsDefined()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 106.7009, description: 'Kinh độ sân do host xác nhận; bắt buộc cho Social mới' })
  @Transform(({ value }) => (value === '' || value === null || value === undefined ? value : Number(value)))
  @IsDefined()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({ example: 6, minimum: 2, maximum: 64 })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(64)
  @IsOptional()
  maxSlots?: number;

  @ApiPropertyOptional({
    example: 50000,
    description: 'Giá 1 vé (VND, 0 = miễn phí)',
  })
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

  @ApiPropertyOptional({
    description: 'Giờ bắt đầu mới (ISO). play_date tự suy ra',
  })
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
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID()
  @IsOptional()
  venueId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID()
  @IsOptional()
  courtId?: string | null;

  @ApiPropertyOptional({ maxLength: 20, nullable: true, description: 'Mã tỉnh/thành phố; null để xoá' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  provinceCode?: string | null;

  @ApiPropertyOptional({ maxLength: 20, nullable: true, description: 'Mã phường/xã; null để xoá' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  wardCode?: string | null;

  @ApiPropertyOptional({ enum: SOCIAL_GENDER_REQUIREMENTS })
  @ValidateIf((_object, value) => value !== undefined)
  @IsIn([...SOCIAL_GENDER_REQUIREMENTS])
  genderRequirement?: SocialGenderRequirement;

  @ApiPropertyOptional({ description: 'Vĩ độ sân mới (đi cặp với longitude; null để xóa vị trí)' })
  @Transform(({ value }) => (value === null || value === undefined || value === '' ? value : Number(value)))
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number | null;

  @ApiPropertyOptional({ description: 'Kinh độ sân mới (đi cặp với latitude; null để xóa vị trí)' })
  @Transform(({ value }) => (value === null || value === undefined || value === '' ? value : Number(value)))
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number | null;

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
  /**
   * Bắt buộc — trừ khi có `search`.
   *
   * Ô tìm kiếm toàn cục không có mốc ngày nào để neo; nếu bắt cứng `date` thì
   * gõ "bóng đá" chỉ ra kèo của *hôm nay* và im lặng bỏ sót phần còn lại.
   * Chỉ nới khi `search` có mặt để không biến endpoint thành "xuất cả bảng":
   * thiếu cả hai thì vẫn 400 như cũ, và kết quả vẫn còn `page`/`limit`
   * (tối đa 50/trang) cùng bộ lọc `status IN ('OPEN','FULL')` của trang kèo.
   */
  @ApiPropertyOptional({
    example: '2026-09-17',
    description: 'Ngày chơi (YYYY-MM-DD). Bắt buộc trừ khi có `search`',
  })
  @Transform(({ value }) =>
    value === undefined || value === null || value === '' ? undefined : value,
  )
  @ValidateIf((object) => object.search !== undefined && object.search !== '')
  @IsString()
  date?: string;

  @ApiPropertyOptional({ type: String, example: 'football' })
  @IsString()
  @IsOptional()
  sport?: string;

  @ApiPropertyOptional({ description: 'Lọc theo Club' })
  @IsUUID()
  @IsOptional()
  communityId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 10.7769, description: 'Vĩ độ user — bật lọc/sắp xếp theo khoảng cách (đi cặp với lng)' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: 106.7009, description: 'Kinh độ user (đi cặp với lat)' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ example: 10, description: 'Bán kính lọc (km, 0.5 - 50). Chỉ áp dụng khi có lat/lng' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(50)
  radiusKm?: number;

  @ApiPropertyOptional({ enum: ['TIME', 'DISTANCE'], description: 'DISTANCE = gần lên trước (chỉ khi có lat/lng)' })
  @IsIn(['TIME', 'DISTANCE'])
  @IsOptional()
  sortBy?: 'TIME' | 'DISTANCE';

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

export const SOCIAL_STATUSES = [
  'OPEN',
  'FULL',
  'COMPLETED',
  'CANCELLED',
] as const;
export type SocialStatus = (typeof SOCIAL_STATUSES)[number];

export class QuerySocialByCommunityDto {
  @ApiPropertyOptional({
    example: 'OPEN,FULL,COMPLETED',
    description:
      'Lọc theo status, cách nhau bằng dấu phẩy (mặc định OPEN,FULL,COMPLETED)',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    example: '2026-09-01',
    description: 'Từ ngày chơi (YYYY-MM-DD)',
  })
  @IsString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-30',
    description: 'Đến ngày chơi (YYYY-MM-DD)',
  })
  @IsString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ type: String, example: 'football' })
  @IsString()
  @IsOptional()
  sport?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 10.7769, description: 'Vĩ độ user — bật lọc/sắp xếp theo khoảng cách (đi cặp với lng)' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: 106.7009, description: 'Kinh độ user (đi cặp với lat)' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ example: 10, description: 'Bán kính lọc (km, 0.5 - 50). Chỉ áp dụng khi có lat/lng' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(50)
  radiusKm?: number;

  @ApiPropertyOptional({ enum: ['TIME', 'DISTANCE'], description: 'DISTANCE = gần lên trước (chỉ khi có lat/lng)' })
  @IsIn(['TIME', 'DISTANCE'])
  @IsOptional()
  sortBy?: 'TIME' | 'DISTANCE';

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

export class SendSocialMessageDto {
  @ApiProperty({ example: 'Chào mọi người, mai đá đúng giờ nhé!' })
  @IsString()
  @MaxLength(2000)
  messageText: string;

  @ApiPropertyOptional({ example: ['https://example.com/image.png'] })
  @IsString({ each: true })
  @IsOptional()
  attachmentsUrls?: string[];

  @ApiPropertyOptional({ description: 'ID tin nhắn được trả lời/trích dẫn' })
  @IsUUID()
  @IsOptional()
  replyToId?: string;
}

export class JoinSocialSessionDto {
  @ApiPropertyOptional({
    example: 1,
    description: 'Number of participant slots requested or joined (default 1)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  @IsOptional()
  ticketCount?: number;
}

export class AddSocialParticipantDto {
  @ApiPropertyOptional({
    description:
      'User được thêm (phải có tài khoản). Bỏ trống khi thêm khách ngoài.',
  })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    description:
      'Tên khách ngoài CLB (không cần tài khoản). Bắt buộc khi userId trống. Chỉ đánh dấu slot đã có người.',
    example: 'Duy',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  guestName?: string;

  @ApiPropertyOptional({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(64)
  @IsOptional()
  ticketCount?: number;
}

export class AddSocialParticipantsBatchDto {
  @ApiProperty({
    description: 'Danh sách userId thành viên CLB cần thêm (1 hoặc nhiều)',
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @IsUUID('4', { each: true })
  userIds: string[];

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
export class QuerySocialJoinRequestsDto {
  @ApiPropertyOptional({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number = 20;
}
