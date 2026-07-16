import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class MediaWebhookDto {
  @ApiProperty({ example: 'on_publish', enum: ['on_publish', 'on_read', 'on_done', 'on_error'] })
  @IsIn(['on_publish', 'on_read', 'on_done', 'on_error'])
  event!: 'on_publish' | 'on_read' | 'on_done' | 'on_error';

  @ApiProperty({ example: 'camera_abcd1234' })
  @IsString()
  @MaxLength(255)
  streamName!: string;

  @ApiProperty({ example: 'Connection lost', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
