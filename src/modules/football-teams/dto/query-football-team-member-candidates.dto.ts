import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class QueryFootballTeamMemberCandidatesDto {
  @ApiProperty({ description: 'Email hoặc tên hiển thị', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit = 10;
}