import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsUUID,
  IsDateString,
  IsArray,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateLiteTournamentDto {
  @ApiProperty({
    example: 'Giải Cầu lông Cuối Tuần',
    description: 'Tên giải đấu',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'uuid-community', description: 'ID câu lạc bộ; bỏ trống để tạo giải nhanh riêng bằng quyền Organizer' })
  @IsUUID()
  @IsOptional()
  communityId?: string;

  @ApiPropertyOptional({ example: 'https://cdn.../banner.jpg', description: 'Ảnh bìa tùy chọn' })
  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @ApiPropertyOptional({ example: 'https://cdn.../logo.jpg', description: 'Logo tùy chọn' })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiPropertyOptional({ example: 'Giải thưởng giao lưu', description: 'Mô tả giải thưởng tùy chọn' })
  @IsString()
  @IsOptional()
  prizeDescription?: string;

  @ApiPropertyOptional({ example: { phone: '0900000000', email: 'btc@example.com' }, description: 'Liên hệ BTC tùy chọn' })
  @IsOptional()
  contactInfo?: Record<string, string>;

  @ApiProperty({
    example: 'badminton',
    description: 'Môn thi đấu (slug)',
    enum: ['badminton', 'tennis', 'pickleball', 'table_tennis', 'football'],
  })
  @IsString()
  @IsIn(['badminton', 'tennis', 'pickleball', 'table_tennis', 'football'])
  sport: string;

  @ApiPropertyOptional({
    example: 'singles',
    description: 'Hình thức: đánh đơn hoặc đôi',
    enum: ['singles', 'doubles'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['singles', 'doubles'])
  format?: string;

  @ApiPropertyOptional({
    example: 'MALE',
    description:
      'Giới hạn giới tính cho giải bóng đá Lite; bỏ trống là không ràng buộc',
    enum: ['MALE', 'FEMALE', 'MIXED'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['MALE', 'FEMALE', 'MIXED'])
  genderRestriction?: 'MALE' | 'FEMALE' | 'MIXED';

  @ApiPropertyOptional({
    example: 'single_elimination',
    description:
      'Thể thức thi đấu. Chỉ hỗ trợ: single_elimination, double_elimination, round_robin, group_stage_knockout.',
    enum: [
      'single_elimination',
      'double_elimination',
      'round_robin',
      'group_stage_knockout',
    ],
  })
  @IsString()
  @IsOptional()
  @IsIn([
    'single_elimination',
    'double_elimination',
    'round_robin',
    'group_stage_knockout',
  ])
  bracketType?: string;

  @ApiPropertyOptional({ example: 16, description: 'Số đội tối đa (2-32)' })
  @IsNumber()
  @IsOptional()
  @Min(2)
  @Max(32)
  maxTeams?: number;

  @ApiPropertyOptional({ example: 7, enum: [5, 7, 11] })
  @IsNumber()
  @IsOptional()
  @IsIn([5, 7, 11])
  teamSize?: 5 | 7 | 11;

  @ApiPropertyOptional({ example: 5 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(20)
  maxReserve?: number;

  @ApiPropertyOptional({ example: 2, description: 'Số set/hiệp thắng mặc định cho môn có set' })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(5)
  setsToWin?: number;

  @ApiPropertyOptional({ example: 21, description: 'Điểm mục tiêu mỗi set của preset; Lite vẫn cho nhập điểm tự do khi thi đấu' })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(99)
  pointsPerSet?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  winByTwo?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(199)
  maxPoints?: number;

  @ApiPropertyOptional({ example: 2, description: 'Số hiệp bóng đá' })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(4)
  footballHalvesCount?: number;

  @ApiPropertyOptional({ example: 45, description: 'Số phút mỗi hiệp bóng đá' })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(120)
  footballHalfDuration?: number;

  @ApiPropertyOptional({ example: true, description: 'Cho phép kết quả hòa trong bóng đá' })
  @IsBoolean()
  @IsOptional()
  footballAllowDraw?: boolean;

  @ApiPropertyOptional({
    example: 'Giải đấu giao lưu cuối tuần',
    description: 'Mô tả giải đấu',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: 'OPEN',
    description: 'Chế độ đăng ký',
    enum: ['OPEN', 'INVITE_ONLY'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['OPEN', 'INVITE_ONLY'])
  registrationMode?: 'OPEN' | 'INVITE_ONLY';

  @ApiPropertyOptional({
    example: 'PRIVATE',
    description: 'Hiển thị giải Lite: PRIVATE nội bộ/mời riêng hoặc PUBLIC chờ Admin duyệt',
    enum: ['PRIVATE', 'PUBLIC'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['PRIVATE', 'PUBLIC'])
  visibility?: 'PRIVATE' | 'PUBLIC';

  @ApiPropertyOptional({ example: 'Sân Pickleball Trung tâm', description: 'Tên sân/địa điểm hiển thị' })
  @IsString()
  @IsOptional()
  venueName?: string;

  @ApiPropertyOptional({ example: 'Số 12 đường ABC, phường X', description: 'Địa chỉ chi tiết địa điểm' })
  @IsString()
  @IsOptional()
  locationAddress?: string;

  @ApiPropertyOptional({ example: 'Hà Nội', description: 'Tỉnh/thành phố' })
  @IsString()
  @IsOptional()
  province?: string;

  @ApiPropertyOptional({ example: 'Nam Từ Liêm', description: 'Quận/huyện' })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional({ example: 'Mỹ Đình', description: 'Phường/xã' })
  @IsString()
  @IsOptional()
  ward?: string;

  @ApiPropertyOptional({ example: '2026-10-01T09:00:00Z', description: 'Ngày giờ mở đăng ký; mặc định hiện tại' })
  @IsDateString()
  @IsOptional()
  registrationStartDate?: string;

  @ApiPropertyOptional({ example: '2026-10-14T23:59:00Z', description: 'Ngày giờ đóng đăng ký; phải trước giờ thi đấu' })
  @IsDateString()
  @IsOptional()
  registrationEndDate?: string;

  @ApiPropertyOptional({
    example: 'Hải Dương',
    description: 'Địa điểm tổ chức',
  })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({
    example: '2026-10-15T00:00:00Z',
    description: 'Ngày bắt đầu',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({
    example: '18:30',
    description: 'Giờ bắt đầu thi đấu (HH:mm)',
  })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({
    example: '2026-10-15T22:00:00Z',
    description: 'Ngày giờ kết thúc',
  })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Giải đấu xếp hạng ELO (true) hay phong trào (false)',
  })
  @IsBoolean()
  @IsOptional()
  isRanked?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: 'Tự động tạo giải lặp lại theo chu kỳ định kỳ',
  })
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @ApiPropertyOptional({
    example: 'WEEKLY',
    description: 'Tần suất lặp lại',
    enum: ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'])
  recurringFrequency?: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

  @ApiPropertyOptional({
    example: 6,
    description: 'Thứ trong tuần (0: CN, 1: T2, ..., 6: T7)',
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(6)
  recurringDayOfWeek?: number;

  @ApiPropertyOptional({
    example: [2, 4, 6],
    description: 'Danh sách các thứ trong tuần (0: CN, 1: T2, ..., 6: T7)',
  })
  @IsArray()
  @IsOptional()
  @IsNumber({}, { each: true })
  recurringDaysOfWeek?: number[];

  @ApiPropertyOptional({
    example: '18:00',
    description: 'Giờ thi đấu định kỳ (HH:mm)',
  })
  @IsString()
  @IsOptional()
  recurringTimeOfDay?: string;

  @ApiPropertyOptional({
    example: 3,
    description:
      'Số ngày tạo giải và mở đăng ký trước ngày thi đấu (VD: Tạo trước 1 ngày, 2 ngày, 3 ngày, 7 ngày)',
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(30)
  recurringAdvanceDays?: number;
}
