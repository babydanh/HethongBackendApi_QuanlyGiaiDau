import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateAqpStreamNameDto {
  @ApiProperty({
    example: 'camera_02',
    description: 'Tên stream mới; dùng đúng một path segment an toàn cho URL RTMP/HLS.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/^[A-Za-z0-9_-]+$/)
  stream!: string;
}
