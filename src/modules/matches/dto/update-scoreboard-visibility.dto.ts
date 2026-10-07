import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateScoreboardVisibilityDto {
  @ApiProperty({
    example: false,
    description:
      'true = hiện bảng điểm live, false = giấu bảng điểm với mọi người xem',
  })
  @IsBoolean()
  visible: boolean;
}
