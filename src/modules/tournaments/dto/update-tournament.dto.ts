import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateTournamentDto } from './create-tournament.dto';
import { IsOptional, IsIn, IsString } from 'class-validator';

export class UpdateTournamentDto extends PartialType(CreateTournamentDto) {
  @ApiPropertyOptional({
    example: 'UPCOMING',
    description: 'Trạng thái giải đấu: DRAFT, UPCOMING, REGISTRATION_OPEN, REGISTRATION_CLOSED, IN_PROGRESS, COMPLETED, CANCELLED',
    enum: ['DRAFT', 'UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['DRAFT', 'UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])
  status?: string;

  @ApiPropertyOptional({ example: 'AB12CD34', description: 'Mã mời tham gia' })
  @IsOptional()
  @IsString()
  inviteCode?: string;
}
