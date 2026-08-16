import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export const MATCH_OPERATION_ACTIONS = [
  'WALKOVER',
  'NO_SHOW',
  'RETIREMENT',
  'DISQUALIFICATION',
  'OVERRIDE_RESULT',
  'POSTPONE',
  'ABANDON',
] as const;

export type MatchOperationAction = (typeof MATCH_OPERATION_ACTIONS)[number];

export class OperateMatchDto {
  @ApiProperty({
    enum: MATCH_OPERATION_ACTIONS,
    description: 'Quyết định nghiệp vụ đặc biệt của BTC cho trận đấu',
    example: 'WALKOVER',
  })
  @IsString()
  @IsIn(MATCH_OPERATION_ACTIONS)
  action: MatchOperationAction;

  @ApiProperty({
    description: 'Lý do bắt buộc để lưu vết nghiệp vụ',
    example: 'Đội đối thủ bỏ cuộc trước giờ thi đấu',
  })
  @IsString()
  @MinLength(5)
  reason: string;

  @ApiPropertyOptional({
    description: 'Participant thắng theo quyết định của BTC',
    example: '6d1d4f2b-2a7a-4c1f-9d8a-15a61d62b7b8',
  })
  @IsOptional()
  @IsUUID()
  winnerId?: string;
}
