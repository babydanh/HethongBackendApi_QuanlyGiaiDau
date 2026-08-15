import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class InviteFootballTeamMemberDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ enum: ['CAPTAIN', 'MANAGER', 'PLAYER'] })
  @IsOptional()
  @IsIn(['CAPTAIN', 'MANAGER', 'PLAYER'])
  role?: 'CAPTAIN' | 'MANAGER' | 'PLAYER';
}
