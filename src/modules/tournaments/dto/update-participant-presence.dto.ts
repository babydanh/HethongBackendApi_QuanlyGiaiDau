import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateParticipantPresenceDto {
  @ApiProperty({
    description:
      'true: Ban tổ chức đánh dấu người tham gia có mặt tại sân. ' +
      'Cờ này chỉ là ghi chú của Ban tổ chức: không ràng buộc duyệt danh sách, ' +
      'không tính ELO, không chặn thi đấu.',
    example: true,
  })
  @IsBoolean()
  present!: boolean;
}
