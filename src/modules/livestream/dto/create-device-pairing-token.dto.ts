import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateDevicePairingTokenDto {
  @ApiPropertyOptional({
    example: 600,
    minimum: 60,
    maximum: 1800,
    default: 600,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(1800)
  ttlSeconds?: number;
}
