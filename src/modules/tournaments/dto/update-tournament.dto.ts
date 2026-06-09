import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateTournamentDto } from './create-tournament.dto';
import { IsOptional, IsIn, IsString } from 'class-validator';

export class UpdateTournamentDto extends PartialType(CreateTournamentDto) {
  @ApiPropertyOptional({
    example: 'ONGOING',
    description: 'Trạng thái giải đấu',
  })
  @IsOptional()
  @IsString()
  @IsIn(['UPCOMING', 'ONGOING', 'COMPLETED', 'CANCELLED'])
  status?: string;
}
