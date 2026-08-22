import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class ParseTournamentSourceDto {
  @ApiPropertyOptional({ description: 'Public HTTP(S) URL containing tournament rules or registration form', maxLength: 2048 })
  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  sourceUrl?: string;

  @ApiPropertyOptional({ description: 'Pasted tournament rules or form text', maxLength: 24000 })
  @IsOptional()
  @IsString()
  @MaxLength(24000)
  rawText?: string;

  @ApiPropertyOptional({ description: 'Sport slug hint used only when the source is ambiguous', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  sportHint?: string;
}
