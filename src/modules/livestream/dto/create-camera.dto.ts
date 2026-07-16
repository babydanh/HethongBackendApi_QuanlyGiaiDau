import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCameraDto {
  @ApiProperty({ example: 'Camera sân 1' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 'RTMP', enum: ['RTMP', 'SRT'] })
  @IsIn(['RTMP', 'SRT'])
  protocol!: 'RTMP' | 'SRT';

  @ApiPropertyOptional({ example: 'Camera cố định góc cuối sân' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
