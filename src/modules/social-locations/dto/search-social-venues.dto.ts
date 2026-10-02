import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, Length, Matches, Max, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SearchSocialVenuesDto {
  @ApiProperty({ minLength: 3, maxLength: 120, example: 'san cau long' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(3, 120)
  @Matches(/^[^\p{Cc}]+$/u, { message: 'q must not contain control characters' })
  q!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  limit = 10;
}
