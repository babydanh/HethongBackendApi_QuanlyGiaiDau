import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString } from 'class-validator';

/**
 * Dates for the controlled "open registration now" flow.
 *
 * The organizer picks a new registration deadline (and optionally a new
 * event start). When the deadline passes the event start, the start date
 * shifts forward and the end date keeps the original event duration.
 */
export class ReopenRegistrationDto {
  @ApiPropertyOptional({
    example: '2026-10-14T23:59:00Z',
    description:
      'Hạn đăng ký mới; khi vượt ngày bắt đầu thì ngày bắt đầu và ngày kết thúc tự dời theo',
  })
  @IsOptional()
  @IsDateString()
  registrationEndDate?: string;

  @ApiPropertyOptional({
    example: '2026-10-20T00:00:00Z',
    description: 'Ngày bắt đầu giải mới; khi không có thì tự dời theo hạn đăng ký mới',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-10-27T00:00:00Z',
    description:
      'Ngày kết thúc giải mới; khi không có thì giữ nguyên thời lượng so với ngày bắt đầu',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
