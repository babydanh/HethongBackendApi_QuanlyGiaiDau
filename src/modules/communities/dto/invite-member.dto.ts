import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ description: 'ID của người được mời' })
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: 'Vai trò (MEMBER/MODERATOR/OWNER)', default: 'MEMBER' })
  @IsString()
  @IsNotEmpty()
  role: string;
}
