import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
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
export const ADD_ATHLETE_MUTATION_SOURCES = [
  ...ADD_ATHLETE_SOURCES,
  'EMAIL',
] as const;
export type AddAthleteMutationSource =
  (typeof ADD_ATHLETE_MUTATION_SOURCES)[number];
export const FOOTBALL_ROSTER_ROLES = ['MAIN', 'RESERVE'] as const;
export type FootballRosterRole = (typeof FOOTBALL_ROSTER_ROLES)[number];

export class SearchAddAthleteCandidatesDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsUUID()
  participantId?: string;
}

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
  @IsIn(ADD_ATHLETE_MUTATION_SOURCES)
  source: AddAthleteMutationSource;

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
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsUUID()
  tournamentDivisionId?: string;
}

export interface AddAthleteCandidate {
  userId: string;
  fullName: string;
  avatarUrl?: string | null;
  logoUrl?: string | null;
}
export interface AddAthleteSearchCandidate extends AddAthleteCandidate {
  email: string;
  sources: AddAthleteMutationSource[];
}

export interface AddedTournamentParticipant {
  participantId: string;
  teamName: string;
  teamStatus: string;
  rosterRole?: FootballRosterRole;
}
