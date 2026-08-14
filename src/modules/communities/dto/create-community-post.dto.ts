import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreatePollDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(150, { each: true })
  options: string[];

  @IsOptional()
  @IsBoolean()
  allowMultipleAnswers?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAddOptions?: boolean;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateCommunityPostDto {
  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  topics?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  mentions?: string[];

  @ApiPropertyOptional({ type: () => CreatePollDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePollDto)
  poll?: CreatePollDto;
}
