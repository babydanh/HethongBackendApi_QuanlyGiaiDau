import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class NearbySocialsQueryDto {
  @Type(() => Number) @IsLatitude()
  lat!: number;

  @Type(() => Number) @IsLongitude()
  lng!: number;

  @Type(() => Number) @IsInt() @Min(100) @Max(50000)
  radius = 10000;

  @ApiPropertyOptional({ description: 'Opaque cursor returned by the prior page' })
  @IsOptional() @IsString() @MaxLength(1000)
  cursor?: string;

  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50)
  limit = 20;
}
