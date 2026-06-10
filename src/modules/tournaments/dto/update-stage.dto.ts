import { IsString, IsOptional, IsUUID, IsDateString, IsObject, ValidateNested, IsInt, Min, IsBoolean, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class RoundConfigDto {
  @IsOptional() @IsInt() @Min(1)
  sets_to_win?: number;
  
  @IsOptional() @IsInt() @Min(1)
  max_sets?: number;
  
  @IsOptional() @IsInt() @Min(1)
  points_per_set?: number;
  
  @IsOptional() @IsBoolean()
  deuce_enabled?: boolean;
  
  @IsOptional() @IsInt() @Min(1)
  deuce_gap?: number;

  @IsOptional() @IsInt() @Min(1)
  tiebreak_at?: number;

  @IsOptional() @IsEnum(['RALLY_POINT', 'TRADITIONAL', 'TIME_BASED'])
  scoring_type?: string;
  
  @IsOptional() @IsInt() @Min(1)
  advance_count?: number;
  
  @IsOptional() @IsBoolean()
  allow_player_choice_court?: boolean;
  
  @IsOptional() @IsInt() @Min(1)
  time_limit_minutes?: number;

  @IsOptional() @IsString()
  custom_notes?: string;
}

export class UpdateStageDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  type?: string;

  @IsOptional() @IsInt()
  order?: number;

  @IsOptional() @IsObject()
  @ValidateNested()
  @Type(() => RoundConfigDto)
  roundConfig?: RoundConfigDto;
  
  @IsOptional() @IsUUID()
  venueId?: string;
  
  @IsOptional() @IsDateString()
  scheduledDate?: string;
  
  @IsOptional() @IsString()
  notificationNote?: string;
}
