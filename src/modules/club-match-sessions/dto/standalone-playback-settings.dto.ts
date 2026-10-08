import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class StandalonePlaybackSettingsDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
    example: 'https://media.example/live/index.m3u8',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2000)
  playbackUrl?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  cameraName?: string | null;
}
