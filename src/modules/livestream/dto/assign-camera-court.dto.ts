import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

export class AssignCameraCourtDto {
  @ApiProperty({
    example: 'uuid-court',
    description:
      'Sân của giải mà camera thuộc về. Gửi null để bỏ gán sân. Bắt buộc có trường này ' +
      '(thiếu trường là lỗi) để body rỗng không vô tình bỏ gán sân.',
    nullable: true,
  })
  @ValidateIf((dto: AssignCameraCourtDto) => dto.courtId !== null)
  @IsUUID()
  courtId!: string | null;
}
