import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { PairLiteParticipantsDto } from './pair-lite-participants.dto';

export class PairLiteParticipantsBatchDto {
  @ApiProperty({
    description:
      'Danh sách đôi cần ghép. Mỗi phần tử là một cặp; toàn bộ batch ghép trong một transaction, lỗi một cặp hủy cả batch.',
    type: [PairLiteParticipantsDto],
    minItems: 1,
    maxItems: 12,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => PairLiteParticipantsDto)
  pairs: PairLiteParticipantsDto[];
}
