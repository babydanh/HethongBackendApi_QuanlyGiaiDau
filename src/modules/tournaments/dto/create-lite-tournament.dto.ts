import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsUUID,
  IsDateString,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateLiteTournamentDto {
  @ApiProperty({ example: 'Giải Cầu lông Cuối Tuần', description: 'Tên giải đấu' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'uuid-community', description: 'ID câu lạc bộ' })
  @IsUUID()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty({ example: 'badminton', description: 'Môn thi đấu (slug)', enum: ['badminton', 'tennis', 'pickleball', 'table_tennis', 'football'] })
  @IsString()
  @IsIn(['badminton', 'tennis', 'pickleball', 'table_tennis', 'football'])
  sport: string;

  @ApiPropertyOptional({ example: 'singles', description: 'Hình thức: đánh đơn hoặc đôi', enum: ['singles', 'doubles'] })
  @IsString()
  @IsOptional()
  @IsIn(['singles', 'doubles'])
  format?: string;

  @ApiPropertyOptional({ example: 'single_elimination', description: 'Thể thức thi đấu. Chỉ hỗ trợ: single_elimination, double_elimination, round_robin, group_stage_knockout.', enum: ['single_elimination', 'double_elimination', 'round_robin', 'group_stage_knockout'] })
  @IsString()
  @IsOptional()
  @IsIn(['single_elimination', 'double_elimination', 'round_robin', 'group_stage_knockout'])
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

  @ApiPropertyOptional({ example: 'Giải đấu giao lưu cuối tuần', description: 'Mô tả giải đấu' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'OPEN', description: 'Chế độ đăng ký', enum: ['OPEN', 'APPROVAL', 'INVITE_ONLY'] })
  @IsString()
  @IsOptional()
  @IsIn(['OPEN', 'APPROVAL', 'INVITE_ONLY'])
  registrationMode?: string;

  @ApiPropertyOptional({ example: 'Hải Dương', description: 'Địa điểm tổ chức' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ example: '2026-10-15T00:00:00Z', description: 'Ngày bắt đầu' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '18:30', description: 'Giờ bắt đầu thi đấu (HH:mm)' })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({ example: '2026-10-15T22:00:00Z', description: 'Ngày giờ kết thúc' })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: false, description: 'Giải đấu xếp hạng ELO (true) hay phong trào (false)' })
  @IsBoolean()
  @IsOptional()
  isRanked?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Tự động tạo giải lặp lại theo chu kỳ định kỳ' })
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @ApiPropertyOptional({ example: 'WEEKLY', description: 'Tần suất lặp lại', enum: ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'] })
  @IsString()
  @IsOptional()
  @IsIn(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'])
  recurringFrequency?: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

  @ApiPropertyOptional({ example: 6, description: 'Thứ trong tuần (0: CN, 1: T2, ..., 6: T7)' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(6)
  recurringDayOfWeek?: number;

  @ApiPropertyOptional({ example: '18:00', description: 'Giờ thi đấu định kỳ (HH:mm)' })
  @IsString()
  @IsOptional()
  recurringTimeOfDay?: string;
}
