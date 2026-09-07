import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';

export class CreateClubMatchSessionDto {
  @IsUUID()
  communityId: string;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isRanked?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(128)
  @IsOptional()
  maxParticipants?: number;

  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @IsIn(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'])
  @IsOptional()
  recurringFrequency?: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  recurringDayOfWeek?: number;

  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ArrayMaxSize(7)
  @IsArray()
  @IsOptional()
  recurringDaysOfWeek?: number[];

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsOptional()
  recurringTimeOfDay?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  @IsOptional()
  recurringAdvanceDays?: number;

  @IsDateString()
  @IsOptional()
  startAt?: string;

  @IsDateString()
  @IsOptional()
  endAt?: string;

  @IsIn(['SELF', 'MANAGER_ASSIGN', 'MIXED'])
  @IsOptional()
  registrationMode?: 'SELF' | 'MANAGER_ASSIGN' | 'MIXED';
}

export class UpdateClubMatchSessionDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsString()
  @MaxLength(255)
  @IsOptional()
  name?: string | null;

  @IsString()
  @MaxLength(4000)
  @IsOptional()
  description?: string | null;

  @IsBoolean()
  @IsOptional()
  isRanked?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(128)
  @IsOptional()
  maxParticipants?: number;

  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @IsIn(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'])
  @IsOptional()
  recurringFrequency?: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  recurringDayOfWeek?: number;

  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @ArrayMaxSize(7)
  @IsArray()
  @IsOptional()
  recurringDaysOfWeek?: number[];

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsOptional()
  recurringTimeOfDay?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  @IsOptional()
  recurringAdvanceDays?: number;

  @IsDateString()
  @IsOptional()
  startAt?: string | null;

  @IsDateString()
  @IsOptional()
  endAt?: string | null;

  @IsIn(['SELF', 'MANAGER_ASSIGN', 'MIXED'])
  @IsOptional()
  registrationMode?: 'SELF' | 'MANAGER_ASSIGN' | 'MIXED';
}

export class TransitionClubMatchSessionDto {
  @IsIn(['CLOSE', 'END', 'CANCEL'])
  action: 'CLOSE' | 'END' | 'CANCEL';

  @IsInt()
  @Min(1)
  version: number;
}

export class QueryClubMatchSessionsDto {
  @IsUUID()
  communityId: string;

  @IsIn(['OPEN', 'LIVE', 'CLOSED', 'ENDED', 'CANCELLED'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;
}

export class QueryClubMatchChildrenDto {
  @IsString()
  @IsOptional()
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit?: number;

  @IsString()
  @IsOptional()
  status?: string;
}

export class ForceClubMatchParticipantsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  userIds: string[];
}

export class CreateClubMatchMockParticipantDto {
  @IsString()
  @MaxLength(255)
  name: string;
}

export class RemoveClubMatchParticipantDto {
  @IsInt()
  @Min(1)
  version: number;
}

export class UpdateClubMatchPreferencesDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  preferredPartnerUserIds: string[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  preferredOpponentUserIds: string[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  avoidUserIds: string[];

  @IsInt()
  @Min(0)
  @IsOptional()
  version?: number;
}

export class CreateClubMatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @IsUUID('4', { each: true })
  sideAUserIds: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @IsUUID('4', { each: true })
  sideBUserIds: string[];

  @IsIn(['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'])
  @IsOptional()
  matchType?: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @IsBoolean()
  @IsOptional()
  confirmWarnings?: boolean;
}

export class ClubMatchRevisionDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  expectedRevision?: number;
}
