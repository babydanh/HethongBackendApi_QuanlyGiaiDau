import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDeviceTokenDto {
  @ApiProperty({ description: 'FCM Device Registration Token' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({ description: 'Platform', enum: ['ANDROID', 'IOS', 'WEB'], default: 'ANDROID' })
  @IsOptional()
  @IsIn(['ANDROID', 'IOS', 'WEB'])
  platform?: 'ANDROID' | 'IOS' | 'WEB';

  @ApiPropertyOptional({ description: 'Device model / OS details' })
  @IsOptional()
  @IsString()
  deviceInfo?: string;
}

export class RemoveDeviceTokenDto {
  @ApiProperty({ description: 'FCM Device Registration Token to remove' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
