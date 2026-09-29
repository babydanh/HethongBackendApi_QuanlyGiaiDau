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
      'Bắt buộc. PUSH: SportO sinh URL RTMP/SRT để camera đẩy luồng lên. PULL: bên ngoài đã phát sẵn, BTC dán URL phát.',
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
    enum: ['RTMP', 'SRT'],
    description: 'Chỉ dùng cho mode PUSH. Với mode PULL có thể bỏ qua.',
  })
  @IsIn(['RTMP', 'SRT'])
  @IsOptional()
  protocol?: 'RTMP' | 'SRT';

  @ApiPropertyOptional({
    example: 'https://media.aqvision.net/live/cam1.live.flv',
    description:
      'Bắt buộc khi mode=PULL. URL phát do bên ngoài cung cấp (.live.flv hoặc /hls.m3u8).',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2000)
  playbackUrl?: string;

  @ApiPropertyOptional({ example: 'Camera cố định góc cuối sân' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
