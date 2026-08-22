import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class PairCameraDeviceDto {
  @ApiProperty({ example: 'device-uuid' })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  deviceId!: string;

  @ApiProperty({ example: 'one-time-pairing-code' })
  @IsString()
  @MinLength(16)
  @MaxLength(255)
  pairingToken!: string;

  @ApiProperty({ example: 'sha256-device-fingerprint' })
  @IsString()
  @MinLength(16)
  @MaxLength(255)
  deviceFingerprint!: string;
}
