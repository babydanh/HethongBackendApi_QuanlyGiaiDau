import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsUUID,
} from 'class-validator';
import {
  ADD_ATHLETE_MUTATION_SOURCES,
  type AddAthleteMutationSource,
} from './add-athlete.dto';

export const ADD_ATHLETE_PAIRS_MIN_USERS = 2;
export const ADD_ATHLETE_PAIRS_MAX_USERS = 25;

export class AddAthletePairsDto {
  @IsIn(ADD_ATHLETE_MUTATION_SOURCES)
  source: AddAthleteMutationSource;

  @IsUUID()
  tournamentDivisionId: string;

  @IsArray()
  @ArrayMinSize(ADD_ATHLETE_PAIRS_MIN_USERS)
  @ArrayMaxSize(ADD_ATHLETE_PAIRS_MAX_USERS)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  userIds: string[];
}
