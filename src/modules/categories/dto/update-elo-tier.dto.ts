import { PartialType } from '@nestjs/swagger';
import { CreateEloTierDto } from './create-elo-tier.dto';

export class UpdateEloTierDto extends PartialType(CreateEloTierDto) {}
