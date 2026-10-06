import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const ADD_ATHLETE_SOURCES = ['FRIENDS', 'CLUB'] as const;
export type AddAthleteSource = (typeof ADD_ATHLETE_SOURCES)[number];
export const FOOTBALL_ROSTER_ROLES = ['MAIN', 'RESERVE'] as const;
export type FootballRosterRole = (typeof FOOTBALL_ROSTER_ROLES)[number];

export class ListAddAthleteCandidatesQueryDto {
  @IsIn(ADD_ATHLETE_SOURCES)
  source: AddAthleteSource;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsUUID()
  participantId?: string;
}

export class AddAthleteCandidateDto {
  @IsIn(ADD_ATHLETE_SOURCES)
  source: AddAthleteSource;

  @IsUUID()
  userId: string;

  @IsOptional()
  @IsUUID()
  tournamentDivisionId?: string;

  @IsOptional()
  @IsUUID()
  participantId?: string;

  @ValidateIf((dto: AddAthleteCandidateDto) => dto.participantId !== undefined)
  @IsDefined()
  @IsIn(FOOTBALL_ROSTER_ROLES)
  role?: FootballRosterRole;
}

export class AddAthleteDirectDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsUUID()
  tournamentDivisionId?: string;
}

export interface AddAthleteCandidate {
  userId: string;
  fullName: string;
}

export interface AddedTournamentParticipant {
  participantId: string;
  teamName: string;
  teamStatus: string;
  rosterRole?: FootballRosterRole;
}
