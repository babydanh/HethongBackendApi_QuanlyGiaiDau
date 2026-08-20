import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export enum GenderRestriction {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  MIXED = 'MIXED',
}

export enum MatchType {
  SINGLES = 'SINGLES',
  DOUBLES = 'DOUBLES',
  MIXED_DOUBLES = 'MIXED_DOUBLES',
}

export enum DivisionBracketType {
  SINGLE_ELIMINATION = 'SINGLE_ELIMINATION',
  DOUBLE_ELIMINATION = 'DOUBLE_ELIMINATION',
  ROUND_ROBIN = 'ROUND_ROBIN',
  GROUP_STAGE_KNOCKOUT = 'GROUP_STAGE_KNOCKOUT',
  GROUP_STAGE_THEN_KNOCKOUT = 'GROUP_STAGE_THEN_KNOCKOUT',
}

export class CreateDivisionDto {
  @ApiProperty({ example: 'Đôi Nam', description: 'Tên hình thức thi đấu' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ enum: MatchType, example: MatchType.DOUBLES })
  @IsEnum(MatchType)
  @IsNotEmpty()
  matchType: MatchType;

  @ApiPropertyOptional({ enum: GenderRestriction, example: GenderRestriction.MALE })
  @IsEnum(GenderRestriction)
  @IsOptional()
  genderRestriction?: GenderRestriction;

  @ApiPropertyOptional({ example: 32, minimum: 1 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxParticipants?: number;

  @ApiPropertyOptional({ example: 150000, minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  entryFee?: number;

  @ApiPropertyOptional({ example: false, description: 'TRUE nếu division dùng cấu hình riêng' })
  @IsBoolean()
  @IsOptional()
  isConfigOverride?: boolean;

  @ApiPropertyOptional({ example: '9e6b3df3-1af0-4cae-b5f6-3df2dd6d0d89' })
  @IsUUID()
  @IsOptional()
  venueId?: string | null;

  @ApiPropertyOptional({ enum: DivisionBracketType, example: DivisionBracketType.SINGLE_ELIMINATION })
  @IsEnum(DivisionBracketType)
  @IsOptional()
  bracketType?: DivisionBracketType | null;

  @ApiPropertyOptional({ example: { setsToWin: 2, pointsPerSet: 21, winByTwo: true } })
  @IsObject()
  @IsOptional()
  roundConfig?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: '2026-07-20T08:00:00Z' })
  @IsDateString()
  @IsOptional()
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2026-07-22T18:00:00Z' })
  @IsDateString()
  @IsOptional()
  endDate?: string | null;

  @ApiPropertyOptional({ example: '2026-07-15T23:59:59Z' })
  @IsDateString()
  @IsOptional()
  registrationEndDate?: string | null;

  @ApiPropertyOptional({ example: 1200, minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  minElo?: number | null;

  @ApiPropertyOptional({ example: 1800, minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  maxElo?: number | null;

  @ApiPropertyOptional({ example: 'Giải nhất 3.000.000đ' })
  @IsString()
  @IsOptional()
  prizeDescription?: string | null;
}
