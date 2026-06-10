import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class ReviewPayoutDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Link ảnh bằng chứng giao dịch (bắt buộc nếu APPROVED)' })
  @IsString()
  @IsOptional()
  transactionProofUrl?: string;

  @ApiPropertyOptional({ description: 'Ghi chú phê duyệt / Lý do từ chối' })
  @IsString()
  @IsOptional()
  note?: string;
}
