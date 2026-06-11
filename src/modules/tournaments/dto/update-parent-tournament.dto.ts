import { PartialType } from '@nestjs/swagger';
import { CreateParentTournamentDto } from './create-parent-tournament.dto';

export class UpdateParentTournamentDto extends PartialType(CreateParentTournamentDto) {}
