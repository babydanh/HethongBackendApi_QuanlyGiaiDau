import { IsOptional, IsInt, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class QueryUserDto extends CursorPaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ default: 'created_at' })
  @IsString()
  @IsOptional()
  sort?: string = 'created_at';

  @ApiPropertyOptional({ default: 'desc' })
  @IsString()
  @IsOptional()
  order?: 'asc' | 'desc' = 'desc';
}
