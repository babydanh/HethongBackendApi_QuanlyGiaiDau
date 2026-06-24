import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsIn } from 'class-validator';

export class AddStaffMemberDto {
  @ApiProperty({ example: 'user@gmail.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'CO_ORGANIZER', enum: ['CO_ORGANIZER', 'REFEREE', 'SPECTATOR'] })
  @IsIn(['CO_ORGANIZER', 'REFEREE', 'SPECTATOR'])
  @IsNotEmpty()
  role: string;
}
