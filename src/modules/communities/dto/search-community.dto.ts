import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SearchCommunityDto {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ enum: ['ALL', 'POSTS', 'MEMBERS', 'MATCHES', 'TOURNAMENTS'] })
  @IsIn(['ALL', 'POSTS', 'MEMBERS', 'MATCHES', 'TOURNAMENTS'])
  type: 'ALL' | 'POSTS' | 'MEMBERS' | 'MATCHES' | 'TOURNAMENTS' = 'ALL';

  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 10 })
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 10;
}
