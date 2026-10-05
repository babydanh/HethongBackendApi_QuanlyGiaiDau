import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * The roster field slots an uploaded spreadsheet column can be mapped to.
 *
 * Origin: `ROSTER_COLUMN_SLOTS` in the web app
 * (`HethongFrontEndWeb_QLgiaidau/src/utils/exportTournament.ts`). The web app stays authoritative
 * for which slots exist; the model may only name one of them, and anything else is dropped.
 */
export const ROSTER_REVIEW_SLOTS = [
  'teamName',
  'player1Name',
  'player1Email',
  'player1Phone',
  'player2Name',
  'player2Email',
  'player2Phone',
  'divisionName',
  'elo',
  'entryType',
  'isPaid',
  'notes',
] as const;

export type RosterReviewSlot = (typeof ROSTER_REVIEW_SLOTS)[number];

const trimValue = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

const trimHeaderList = ({ value }: { value: unknown }): unknown =>
  Array.isArray(value) ? value.map((header) => (typeof header === 'string' ? header.trim() : header)) : value;

/** Read-only request body: an uploaded sheet's shape, never its file bytes. */
export class RosterReviewRequestDto {
  @ApiPropertyOptional({ description: 'Sheet name shown in the workbook, for disambiguating repeated headers', maxLength: 120 })
  @Transform(trimValue)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sheetName?: string;

  @ApiPropertyOptional({ description: '1-based row the headers sit on; lets the model notice a title row above them', minimum: 1, maximum: 200 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  headerRow?: number;

  @ApiProperty({ description: 'Exact header cells of the chosen sheet, in column order', type: [String], minItems: 1, maxItems: 60 })
  @Transform(trimHeaderList)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  headers!: string[];

  @ApiProperty({ description: 'Up to 8 sample data rows, keyed by the same header text; used only as layout evidence', type: [Object], maxItems: 8 })
  @IsArray()
  @ArrayMaxSize(8)
  @IsObject({ each: true })
  sampleRows!: Record<string, unknown>[];

  @ApiProperty({ description: 'Whether this sheet holds doubles entries; singles sheets have no second player' })
  @IsBoolean()
  isDoubles!: boolean;
}