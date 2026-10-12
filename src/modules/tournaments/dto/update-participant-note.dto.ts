import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateParticipantNoteDto {
  @ApiProperty({
    description:
      'Ghi chú nội bộ của Ban tổ chức cho người tham gia. Chuỗi rỗng sẽ xóa ghi chú.',
    maxLength: 2000,
    example: 'Đã nộp lệ phí bằng tiền mặt',
  })
  @IsString()
  @MaxLength(2000)
  note!: string;
}
