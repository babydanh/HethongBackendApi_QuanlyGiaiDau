import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export const ADMIN_ELO_OPERATIONS = [
  'ADD',
  'SUBTRACT',
  'SET',
  'RESET',
  'HIDE',
  'BAN',
  'RESTORE',
] as const;

export type AdminEloOperation = (typeof ADMIN_ELO_OPERATIONS)[number];
export type RankingVisibilityStatus = 'VISIBLE' | 'HIDDEN' | 'BANNED';

export class AdminEloOperationDto {
  @ApiProperty({ minLength: 16, maxLength: 128 })
  @IsString()
  @MinLength(16)
  @MaxLength(128)
  operationKey: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ enum: ['PUBLIC', 'COMMUNITY'] })
  @IsIn(['PUBLIC', 'COMMUNITY'])
  scope: 'PUBLIC' | 'COMMUNITY';

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  communityId?: string;

  @ApiProperty({ example: 'SINGLES' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  matchType: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  genderRestriction?: string;

  @ApiProperty({ enum: ADMIN_ELO_OPERATIONS })
  @IsIn(ADMIN_ELO_OPERATIONS)
  operation: AdminEloOperation;

  @ApiPropertyOptional({ minimum: 0, maximum: 10000, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  requestedValue?: number;

  @ApiProperty({ minLength: 5, maxLength: 500 })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

export class AdminEloHistoryQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}

export class AdminEloQueryDto extends CursorPaginationDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'COMMUNITY'], default: 'PUBLIC' })
  @IsOptional()
  @IsIn(['PUBLIC', 'COMMUNITY'])
  scope: 'PUBLIC' | 'COMMUNITY' = 'PUBLIC';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  communityId?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  matchType?: string;

  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  genderRestriction?: string;

  @ApiPropertyOptional({ enum: ['VISIBLE', 'HIDDEN', 'BANNED'] })
  @IsOptional()
  @IsIn(['VISIBLE', 'HIDDEN', 'BANNED'])
  status?: RankingVisibilityStatus;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minElo?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxElo?: number;
}

export class AdminEloPlayerQueryDto extends CursorPaginationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: ['PUBLIC', 'COMMUNITY'] })
  @IsOptional()
  @IsIn(['PUBLIC', 'COMMUNITY'])
  scope?: 'PUBLIC' | 'COMMUNITY';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  communityId?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  matchType?: string;

  @ApiPropertyOptional({ enum: ['VISIBLE', 'HIDDEN', 'BANNED'] })
  @IsOptional()
  @IsIn(['VISIBLE', 'HIDDEN', 'BANNED'])
  status?: RankingVisibilityStatus;
}

export class AdminEloPlayerDetailQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId: string;
}
