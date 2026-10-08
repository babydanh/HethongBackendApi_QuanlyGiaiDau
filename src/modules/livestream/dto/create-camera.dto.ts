import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCameraDto {
  @ApiProperty({ example: 'Camera sân 1' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    example: 'PUSH',
    enum: ['PUSH', 'PULL'],
    description:
      'Bắt buộc. PUSH: camera đẩy luồng lên AQP (RTMP), SportO trả URL đích. PULL: SportO nhờ AQP kéo từ camera, hoặc BTC dán URL phát đã có sẵn.',
  })
  @IsIn(['PUSH', 'PULL'])
  mode!: 'PUSH' | 'PULL';

  @ApiPropertyOptional({
    example: '9f1c2b3a-0000-4000-8000-000000000001',
    description:
      'Sân mà camera phục vụ. Khi có courtId, hệ thống tự gán camera này cho mọi trận diễn tại sân đó.',
  })
  @IsOptional()
  @IsUUID()
  courtId?: string;

  @ApiProperty({
    example: 'RTMP',
    enum: ['RTMP'],
    description:
      'Giao thức ĐẨY lên AQP. Chỉ RTMP: AQP không nhận SRT, và SportO không còn media server riêng.',
  })
  @IsIn(['RTMP'])
  @IsOptional()
  protocol?: 'RTMP';

  @ApiPropertyOptional({
    example: 'https://media.aqvision.net/live/cam1/hls.m3u8',
    description:
      'Chỉ dùng cho mode=PULL khi luồng ĐÃ được phát sẵn từ bên ngoài; BTC dán URL phát vào. Loại trừ lẫn nhau với cameraRtspUrl.',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2000)
  playbackUrl?: string;

  @ApiPropertyOptional({
    example: 'rtsp://admin:matkhau@192.168.1.50:554/Streaming/Channels/101',
    description:
      'Chỉ dùng cho mode=PULL khi nguồn là CAMERA IP tại sân: hệ thống nhờ media server AQP kéo luồng từ địa chỉ này về (không cần stream key). Loại trừ lẫn nhau với playbackUrl.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cameraRtspUrl?: string;

  @ApiPropertyOptional({ example: 'Camera cố định góc cuối sân' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
