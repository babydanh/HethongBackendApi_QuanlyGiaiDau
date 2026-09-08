import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddLiteClubMemberDto {
  @ApiProperty({
    description: 'ID user của thành viên CLB đang ở trạng thái JOINED',
  })
  @IsUUID('4')
  userId: string;
}
