import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { DivisionBracketType, GenderRestriction, MatchType } from './create-division.dto';

export class UpdateDivisionDto {
  @ApiPropertyOptional({ example: 'Đôi Nam' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ enum: MatchType })
  @IsEnum(MatchType)
  @IsOptional()
  matchType?: MatchType;

  @ApiPropertyOptional({ enum: GenderRestriction, nullable: true })
  @IsEnum(GenderRestriction)
  @IsOptional()
  genderRestriction?: GenderRestriction | null;

  @ApiPropertyOptional({ example: 32, nullable: true, minimum: 1 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  maxParticipants?: number | null;

  @ApiPropertyOptional({ example: 150000, minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  entryFee?: number;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isConfigOverride?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsUUID()
  @IsOptional()
  venueId?: string | null;

  @ApiPropertyOptional({ enum: DivisionBracketType, nullable: true })
  @IsEnum(DivisionBracketType)
  @IsOptional()
  bracketType?: DivisionBracketType | null;

  @ApiPropertyOptional({ example: { setsToWin: 2, pointsPerSet: 21, winByTwo: true }, nullable: true })
  @IsObject()
  @IsOptional()
  roundConfig?: Record<string, unknown> | null;

  @ApiPropertyOptional({ example: '2026-07-20T08:00:00Z', nullable: true })
  @IsDateString()
  @IsOptional()
  startDate?: string | null;

  @ApiPropertyOptional({ example: '2026-07-22T18:00:00Z', nullable: true })
  @IsDateString()
  @IsOptional()
  endDate?: string | null;

  @ApiPropertyOptional({ example: '2026-07-15T23:59:59Z', nullable: true })
  @IsDateString()
  @IsOptional()
  registrationEndDate?: string | null;

  @ApiPropertyOptional({ example: 1200, nullable: true, minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  minElo?: number | null;

  @ApiPropertyOptional({ example: 1800, nullable: true, minimum: 0 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  maxElo?: number | null;

  @ApiPropertyOptional({ example: 'Giải nhất 3.000.000đ', nullable: true })
  @IsString()
  @IsOptional()
  prizeDescription?: string | null;
}
