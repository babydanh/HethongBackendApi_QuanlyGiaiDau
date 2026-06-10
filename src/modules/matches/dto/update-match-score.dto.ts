import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min, IsObject, IsOptional, IsUUID } from 'class-validator';

export class UpdateMatchScoreDto {
  @ApiProperty({ example: 2, description: 'Số set thắng của Participant 1' })
  @IsInt()
  @Min(0)
  p1SetsWon: number;

  @ApiProperty({ example: 1, description: 'Số set thắng của Participant 2' })
  @IsInt()
  @Min(0)
  p2SetsWon: number;

  @ApiPropertyOptional({
    example: { set1: '6-4', set2: '4-6', set3: '10-8' },
    description: 'Chi tiết điểm số các hiệp/set',
  })
  @IsOptional()
  @IsObject()
  scoreDetails?: Record<string, string>;

  @ApiPropertyOptional({
    example: 'uuid-participant',
    description: 'ID của người thắng cuộc',
  })
  @IsOptional()
  @IsUUID()
  winnerId?: string;
}
