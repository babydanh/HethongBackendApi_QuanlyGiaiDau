import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class QuerySeriesDto extends CursorPaginationDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 10,
    description: 'Số lượng / trang (Tối đa 50)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'Superstars', description: 'Từ khóa tìm kiếm theo tên hoặc mô tả' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'ACTIVE',
    description: 'Lọc theo trạng thái chuỗi: DRAFT, ACTIVE, COMPLETED, CANCELLED',
    enum: ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'])
  status?: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional({
    example: 'PUBLIC',
    description: 'Lọc theo chế độ hiển thị: PUBLIC hoặc PRIVATE',
    enum: ['PUBLIC', 'PRIVATE'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['PUBLIC', 'PRIVATE'])
  visibility?: 'PUBLIC' | 'PRIVATE';

  @ApiPropertyOptional({ example: 'uuid-organizer', description: 'Lọc theo ID người tạo' })
  @IsOptional()
  @IsString()
  organizerId?: string;
}
