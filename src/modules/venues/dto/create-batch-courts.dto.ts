import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateBatchCourtsDto {
  @ApiProperty({ example: 4, description: 'Số lượng sân cần tạo' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsNotEmpty()
  courtCount: number;

  @ApiPropertyOptional({ example: 'Sân', description: 'Tiền tố tên sân (mặc định: Sân)' })
  @IsOptional()
  @IsString()
  namePrefix?: string;
}
