import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({ description: 'ID của người được mời' })
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: 'Vai trò được mời (MEMBER/MODERATOR)', default: 'MEMBER' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['MEMBER', 'MODERATOR'])
  role: 'MEMBER' | 'MODERATOR';
}
