import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn, IsOptional, IsUUID } from 'class-validator';

export class GenerateLitePairsDto {
  @ApiProperty({ description: 'Chiến lược ghép cặp', enum: ['RANDOM', 'ELO_BALANCED'], example: 'RANDOM' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['RANDOM', 'ELO_BALANCED'])
  strategy: 'RANDOM' | 'ELO_BALANCED';

  @ApiProperty({
    description: 'Chỉ ghép VĐV thuộc nội dung này (bỏ trống = toàn giải)',
    required: false,
    example: 'uuid-division',
  })
  @IsOptional()
  @IsUUID()
  divisionId?: string;
}
