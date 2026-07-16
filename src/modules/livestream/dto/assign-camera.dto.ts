import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignCameraDto {
  @ApiProperty({ example: 'uuid-camera' })
  @IsUUID()
  cameraId!: string;
}
