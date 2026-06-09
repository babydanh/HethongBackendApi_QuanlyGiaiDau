import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

export class CreateVenueCourtDto {
  @ApiProperty({ example: 'Sân số 1', description: 'Tên sân con' })
  @IsString()
  @IsNotEmpty()
  courtName: string;

  @ApiPropertyOptional({
    example: 'AVAILABLE',
    description: 'Trạng thái sân (AVAILABLE, MAINTENANCE)',
  })
  @IsOptional()
  @IsString()
  @IsIn(['AVAILABLE', 'MAINTENANCE'])
  status?: string;
}
