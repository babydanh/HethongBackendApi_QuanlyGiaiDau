import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class PairLiteParticipantsDto {
  @ApiProperty({ description: 'ID của participant thứ nhất (giữ lại)', example: 'uuid-p1' })
  @IsUUID()
  @IsNotEmpty()
  participant1Id: string;

  @ApiProperty({ description: 'ID của participant thứ hai (sẽ merged vào p1)', example: 'uuid-p2' })
  @IsUUID()
  @IsNotEmpty()
  participant2Id: string;

  @ApiProperty({
    description: 'Tên đội/cặp thi đấu sau khi ghép (tuỳ chọn, nếu bỏ trống hệ thống tự đặt Tên 1 / Tên 2)',
    required: false,
    example: 'Cặp đôi Hoàn Hảo',
  })
  @IsString()
  @IsOptional()
  teamName?: string;
}
