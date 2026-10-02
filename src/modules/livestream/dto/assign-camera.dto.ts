import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AssignCameraDto {
  @ApiProperty({
    example: 'uuid-camera',
    description:
      'Camera gán riêng cho trận này. Gửi null để bỏ gán tay và trả trận về camera của sân.',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  cameraId!: string | null;
}