import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

const trimValue = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class ParseTournamentSourceDto {
  @ApiProperty({ description: 'Organizer description of the tournament to draft or change', maxLength: 4000 })
  @Transform(trimValue)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  instruction!: string;

  @ApiPropertyOptional({ description: 'Public HTTP(S) URL containing tournament rules or registration form; mutually exclusive with rawText', maxLength: 2048 })
  @Transform(trimValue)
  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  sourceUrl?: string;

  @ApiPropertyOptional({ description: 'Already-extracted plain text; source bytes are never posted', maxLength: 24000 })
  @Transform(trimValue)
  @IsOptional()
  @IsString()
  @MaxLength(24000)
  rawText?: string;

  @ApiPropertyOptional({ description: 'Sport slug hint used only when the source is ambiguous', maxLength: 64 })
  @Transform(trimValue)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sportHint?: string;

  @ApiPropertyOptional({ description: 'Current schema-valid draft; sent only when refining, without a new source' })
  @IsOptional()
  @IsObject()
  currentDraft?: Record<string, unknown>;
}
