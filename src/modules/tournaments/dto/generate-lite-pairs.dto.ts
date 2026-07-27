import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class GenerateLitePairsDto {
  @ApiProperty({ description: 'Chiến lược ghép cặp', enum: ['RANDOM', 'ELO_BALANCED'], example: 'RANDOM' })
  @IsString()
  @IsNotEmpty()
  @IsIn(['RANDOM', 'ELO_BALANCED'])
  strategy: 'RANDOM' | 'ELO_BALANCED';
}
