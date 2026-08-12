import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class QueryCommunityPostsDto extends CursorPaginationDto {
  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  declare limit?: number;

  @ApiPropertyOptional({ description: 'Chỉ dùng LATEST ở MVP' })
  @IsOptional()
  @IsString()
  sort?: 'LATEST';
}
