import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSeriesDto } from './create-series.dto';
import { IsOptional, IsIn, IsString } from 'class-validator';

export class UpdateSeriesDto extends PartialType(CreateSeriesDto) {
  @ApiPropertyOptional({
    example: 'ACTIVE',
    description: 'Trạng thái chuỗi: DRAFT, ACTIVE, COMPLETED, CANCELLED',
    enum: ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
  status?: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
}
