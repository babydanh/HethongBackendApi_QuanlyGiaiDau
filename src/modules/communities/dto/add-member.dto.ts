import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class AddMemberDto {
  @ApiProperty({ description: 'ID của user cần thêm vào nhóm' })
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: ['OWNER', 'MODERATOR', 'MEMBER'], default: 'MEMBER' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['OWNER', 'MODERATOR', 'MEMBER'])
  role: 'OWNER' | 'MODERATOR' | 'MEMBER';
}
