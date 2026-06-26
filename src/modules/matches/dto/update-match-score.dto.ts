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
    example: { sets: [{ team1Score: 6, team2Score: 4, isFinished: true }] },
    description: 'Chi tiết điểm số các hiệp/set. Hỗ trợ cả format { sets: [...] } và format legacy { set1: "6-4" }.',
  })
  @IsOptional()
  @IsObject()
  scoreDetails?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: 'uuid-participant',
    description: 'ID của người thắng cuộc',
  })
  @IsOptional()
  @IsUUID()
  winnerId?: string;
}
