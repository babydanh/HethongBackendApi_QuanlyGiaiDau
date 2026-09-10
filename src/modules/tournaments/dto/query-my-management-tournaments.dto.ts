import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class QueryMyManagementTournamentsDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    example: 10,
    description: 'Số card quản lý trả về trong một lần tải',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number = 10;

  @ApiPropertyOptional({
    example: 20,
    minimum: 0,
    description: 'Vị trí bắt đầu của trang hiện tại (offset, bắt đầu từ 0)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiPropertyOptional({
    enum: ['COMPLETED'],
    description: 'Chỉ lọc các giải đã kết thúc',
  })
  @IsOptional()
  @IsIn(['COMPLETED'])
  status?: 'COMPLETED';
}
