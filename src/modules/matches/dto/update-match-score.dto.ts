import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { FootballScoreDetailsDto } from './football-score-details.dto';

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
  scoreDetails?: Record<string, unknown> & { football?: FootballScoreDetailsDto };

  @ApiPropertyOptional({
    example: 'uuid-participant hoặc SIDE_A',
    description:
      'ID participant của người thắng; trận giao lưu dùng SIDE_A hoặc SIDE_B',
  })
  @IsOptional()
  @IsString()
  @Matches(
    /^(SIDE_[AB]|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  )
  winnerId?: string;

  @ApiPropertyOptional({
    example: 'Trọng tài xác nhận set cuối đánh tie-break rút gọn theo điều lệ sân.',
    description: 'Lý do override khi cần chốt tỉ số không bám hoàn toàn theo preset luật mặc định.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  overrideReason?: string;

  @ApiPropertyOptional({
    example: 5,
    description:
      'Revision hiện tại client đang hiển thị. Backend chỉ ghi điểm nếu khớp (optimistic lock); lệch sẽ trả 409 kèm currentRevision.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}
