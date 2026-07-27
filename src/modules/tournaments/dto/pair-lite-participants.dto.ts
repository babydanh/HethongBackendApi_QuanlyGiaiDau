import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class PairLiteParticipantsDto {
  @ApiProperty({ description: 'ID của participant thứ nhất (giữ lại)', example: 'uuid-p1' })
  @IsUUID()
  @IsNotEmpty()
  participant1Id: string;

  @ApiProperty({ description: 'ID của participant thứ hai (sẽ merged vào p1)', example: 'uuid-p2' })
  @IsUUID()
  @IsNotEmpty()
  participant2Id: string;
}
