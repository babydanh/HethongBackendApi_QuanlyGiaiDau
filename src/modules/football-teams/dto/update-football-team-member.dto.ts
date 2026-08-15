import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateFootballTeamMemberDto {
  @ApiProperty({ enum: ['CAPTAIN', 'MANAGER', 'PLAYER'] })
  @IsIn(['CAPTAIN', 'MANAGER', 'PLAYER'])
  role!: 'CAPTAIN' | 'MANAGER' | 'PLAYER';
}
