import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class QueryMyManagementTournamentsDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    example: 12,
    description: 'Số card quản lý trả về trong một lần tải',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 12;

  @ApiPropertyOptional({
    enum: ['COMPLETED'],
    description: 'Chỉ lọc các giải đã kết thúc',
  })
  @IsOptional()
  @IsIn(['COMPLETED'])
  status?: 'COMPLETED';
}
