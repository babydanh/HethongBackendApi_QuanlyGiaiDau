import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateMemberDto {
  @ApiProperty({ enum: ['OWNER', 'MODERATOR', 'MEMBER'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['OWNER', 'MODERATOR', 'MEMBER'])
  role: 'OWNER' | 'MODERATOR' | 'MEMBER';
}
