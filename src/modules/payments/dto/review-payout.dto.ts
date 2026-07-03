import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export const payoutReviewStatuses = [
  'UNDER_REVIEW',
  'APPROVED',
  'PROCESSING',
  'PAID',
  'REJECTED',
] as const;
export type PayoutReviewStatus = (typeof payoutReviewStatuses)[number];

export class ReviewPayoutDto {
  @ApiProperty({ enum: payoutReviewStatuses })
  @IsString()
  @IsNotEmpty()
  @IsIn(payoutReviewStatuses)
  status: PayoutReviewStatus;

  @ApiPropertyOptional({ description: 'Link bằng chứng giao dịch (bắt buộc khi APPROVED hoặc PAID)' })
  @IsString()
  @IsOptional()
  transactionProofUrl?: string;

  @ApiPropertyOptional({ description: 'Ghi chú phê duyệt / Lý do từ chối' })
  @IsString()
  @IsOptional()
  note?: string;
}
