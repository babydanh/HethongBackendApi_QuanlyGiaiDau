import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import type { LocationRegion } from '../../../common/helpers/location-region.helper';

export class QueryCommunityActivityFeedDto extends CursorPaginationDto {
  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  declare limit?: number;

  @ApiPropertyOptional({ example: '2026-09-16', description: 'Ngày theo lịch Việt Nam' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional({ enum: ['CLUB_RECRUITING', 'TOURNAMENT_OPENED'] })
  @IsOptional()
  @IsIn(['CLUB_RECRUITING', 'TOURNAMENT_OPENED'])
  type?: 'CLUB_RECRUITING' | 'TOURNAMENT_OPENED';

  @ApiPropertyOptional({ enum: ['VIETNAM', 'FOREIGN', 'OTHER'] })
  @IsOptional()
  @IsIn(['VIETNAM', 'FOREIGN', 'OTHER'])
  region?: LocationRegion;
}
