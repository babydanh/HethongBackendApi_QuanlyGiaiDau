import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export const SCHEDULE_PLAN_STRATEGY = 'ROUND_ORDER_EARLIEST_AVAILABLE' as const;
export type SchedulePlanStrategy = typeof SCHEDULE_PLAN_STRATEGY;

export class ScheduleOperatingWindowDto {
  @IsDateString()
  start!: string;

  @IsDateString()
  end!: string;
}

export class CreateSchedulePlanDto {
  @IsOptional()
  @IsUUID()
  divisionId?: string;

  @IsDateString()
  date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @IsUUID('4', { each: true })
  courtIds!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  matchIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes: number = 45;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  bufferMinutes: number = 5;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleOperatingWindowDto)
  operatingWindow?: ScheduleOperatingWindowDto;

  @IsIn([SCHEDULE_PLAN_STRATEGY])
  readonly strategy: SchedulePlanStrategy = SCHEDULE_PLAN_STRATEGY;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  scheduleVersion?: string;
}
