import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReviewCommunityDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Lý do từ chối (nếu status = REJECTED)' })
  @IsString()
  @IsOptional()
  rejectedReason?: string;
}
