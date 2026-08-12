import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, IsEnum } from 'class-validator';

export class CursorPaginationDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(['next', 'prev'])
  direction?: 'next' | 'prev' = 'next';
}
