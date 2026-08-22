import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class HeartbeatCameraDeviceDto {
  @ApiProperty({ example: 'sha256-device-fingerprint' })
  @IsString()
  @MinLength(16)
  @MaxLength(255)
  deviceFingerprint!: string;
}
