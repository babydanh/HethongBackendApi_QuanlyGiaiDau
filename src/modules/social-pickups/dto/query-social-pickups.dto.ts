import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import type { LocationRegion } from '../../../common/helpers/location-region.helper';

export class QuerySocialPickupsDto extends CursorPaginationDto {
  @ApiPropertyOptional({ example: '2026-09-25' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ['VIETNAM', 'FOREIGN', 'OTHER'] })
  @IsOptional()
  @IsIn(['VIETNAM', 'FOREIGN', 'OTHER'])
  region?: LocationRegion;
}
