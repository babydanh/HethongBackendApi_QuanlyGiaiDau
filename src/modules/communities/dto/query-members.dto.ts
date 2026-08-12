import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryMembersDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 50, description: 'Số lượng / trang (Tối đa 200)' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({
    enum: ['JOINED', 'PENDING', 'INVITED', 'REJECTED', 'BANNED'],
    description: 'Lọc theo trạng thái thành viên',
  })
  @IsOptional()
  @IsIn(['JOINED', 'PENDING', 'INVITED', 'REJECTED', 'BANNED'])
  status?: string;
}
