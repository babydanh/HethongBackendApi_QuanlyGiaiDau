import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
