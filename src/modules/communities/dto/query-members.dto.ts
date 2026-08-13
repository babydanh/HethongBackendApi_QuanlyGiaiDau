import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsString } from 'class-validator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

export class QueryMembersDto extends CursorPaginationDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 50,
    description: 'Số lượng / trang (Tối đa 200)',
  })
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

  @ApiPropertyOptional({
    description: 'Tìm theo tên thành viên. Dùng cho danh sách gợi ý @mention.',
    maxLength: 80,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({
    description:
      'Chỉ trả thành viên JOINED cho bộ gợi ý @mention. Giới hạn tối đa 20 kết quả.',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mentionable?: boolean;
}
