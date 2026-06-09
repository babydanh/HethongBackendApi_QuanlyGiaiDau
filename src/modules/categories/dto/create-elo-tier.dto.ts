import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateEloTierDto {
  @ApiProperty({ example: 'Advanced', description: 'Tên bậc ELO' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 2000, description: 'Điểm ELO tối thiểu' })
  @IsInt()
  @Min(0)
  minElo: number;

  @ApiProperty({ example: 2500, description: 'Điểm ELO tối đa' })
  @IsInt()
  @Min(0)
  maxElo: number;

  @ApiPropertyOptional({
    example: 'https://example.com/icon.png',
    description: 'URL ảnh icon của bậc ELO',
  })
  @IsString()
  @IsOptional()
  iconUrl?: string;
}
