import { Type } from 'class-transformer';
import { ScheduleOperatingWindowDto } from '../../matches/dto/create-schedule-plan.dto';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsObject,
  IsString,
  ValidateNested,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class AiScheduleCommandDto {
  @IsString()
  @MaxLength(4000)
  command!: string;

  @IsDateString({ strict: true })
  date!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(32)
  @IsUUID('4', { each: true })
  courtIds!: string[];

  @IsOptional()
  @IsUUID('4')
  divisionId?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @IsIn([5, 10, 15, 30, 60])
  gridIncrementMinutes?: 5 | 10 | 15 | 30 | 60;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  locale?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ScheduleOperatingWindowDto)
  operatingWindow?: ScheduleOperatingWindowDto;
}
