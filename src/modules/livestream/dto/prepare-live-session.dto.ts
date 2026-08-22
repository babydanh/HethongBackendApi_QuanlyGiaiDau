import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PrepareLiveSessionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tournamentId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  courtId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  matchId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cameraDeviceId!: string;

  @ApiProperty({ example: 'Sân 1 — Bán kết đôi nam' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({ example: 'Giải SportO Open 2026' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiProperty({ example: 'match-uuid-camera-uuid-attempt-1' })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  idempotencyKey!: string;
}
