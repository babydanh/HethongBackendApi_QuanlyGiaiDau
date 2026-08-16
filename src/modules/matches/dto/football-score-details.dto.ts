import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const FOOTBALL_PHASES = [
  'FIRST_HALF',
  'HALFTIME',
  'SECOND_HALF',
  'STOPPAGE_TIME',
  'FULL_TIME',
  'EXTRA_TIME_FIRST_HALF',
  'EXTRA_TIME_BREAK',
  'EXTRA_TIME_SECOND_HALF',
  'PENALTY_SHOOTOUT',
  'COMPLETED',
] as const;

export type FootballPhase = (typeof FOOTBALL_PHASES)[number];

export class FootballShootoutDto {
  @ApiPropertyOptional({ example: 5 })
  @IsInt()
  @Min(0)
  @Max(99)
  team1Goals!: number;

  @ApiPropertyOptional({ example: 4 })
  @IsInt()
  @Min(0)
  @Max(99)
  team2Goals!: number;

  @ApiPropertyOptional({ example: 'participant-id' })
  @IsOptional()
  @IsString()
  winnerId?: string;
}

export class FootballEventDto {
  @IsString()
  @IsIn([
    'GOAL',
    'OWN_GOAL',
    'PENALTY_GOAL',
    'YELLOW_CARD',
    'RED_CARD',
    'FOUL',
    'SUBSTITUTION',
    'VAR',
    'NOTE',
  ])
  type!: string;

  @IsInt()
  @IsIn([1, 2])
  team!: 1 | 2;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  minute?: number;

  @ApiPropertyOptional({
    example: 4,
    description: 'Phút bù giờ của mốc sự kiện',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  addedMinute?: number;
}

export class FootballScoreDetailsDto {
  @IsInt()
  @Min(0)
  team1Goals!: number;

  @IsInt()
  @Min(0)
  team2Goals!: number;

  @IsString()
  @IsIn(FOOTBALL_PHASES)
  phase!: FootballPhase;

  @ApiPropertyOptional({ example: 90, description: 'Phút thi đấu hiện tại' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  minute?: number;

  @ApiPropertyOptional({ example: 4, description: 'Phút bù giờ hiện tại' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  addedMinute?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FootballShootoutDto)
  shootout?: FootballShootoutDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FootballEventDto)
  events?: FootballEventDto[];
}
