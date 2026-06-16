import { IsString, IsArray, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateReportDto {
  @ApiProperty({ description: 'Loại đối tượng bị tố cáo', enum: ['USER', 'TOURNAMENT'] })
  @IsEnum(['USER', 'TOURNAMENT'])
  targetType: 'USER' | 'TOURNAMENT';

  @ApiProperty({ description: 'ID của đối tượng bị tố cáo' })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @ApiProperty({ description: 'Lý do tố cáo' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ description: 'Danh sách các hình ảnh bằng chứng (nếu có)', required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  evidenceUrls?: string[] = [];
}
