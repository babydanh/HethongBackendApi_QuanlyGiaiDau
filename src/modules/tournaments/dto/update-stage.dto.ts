import { IsString, IsOptional, IsUUID, IsDateString, IsObject, IsInt } from 'class-validator';

export class UpdateStageDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  type?: string;

  @IsOptional() @IsInt()
  order?: number;

  @IsOptional() @IsObject()
  roundConfig?: Record<string, unknown>;
  
  @IsOptional() @IsUUID()
  venueId?: string;
  
  @IsOptional() @IsDateString()
  scheduledDate?: string;
  
  @IsOptional() @IsString()
  notificationNote?: string;

  @IsOptional() @IsObject()
  matchSettings?: Record<string, unknown>;
}
