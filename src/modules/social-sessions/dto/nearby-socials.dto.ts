import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class NearbySocialsQueryDto {
  @ApiProperty({ description: 'Latitude của điểm tham chiếu' })
  @Type(() => Number) @IsLatitude()
  lat!: number;

  @ApiProperty({ description: 'Longitude của điểm tham chiếu' })
  @Type(() => Number) @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({ description: 'Bán kính tính bằng km', default: 10 })
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0.5) @Max(50)
  radiusKm?: number;

  /** Deprecated metres-based alias retained while older app builds migrate. */
  @ApiPropertyOptional({ description: 'Alias cũ tính bằng mét, 100–50000' })
  @Type(() => Number) @IsOptional() @IsInt() @Min(100) @Max(50000)
  radius?: number;

  /** Non-empty cursors are retired; page/limit is the supported contract. */
  @IsOptional() @IsString() @MaxLength(1000)
  cursor?: string;

  @Type(() => Number) @IsInt() @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(50)
  limit?: number;
}
