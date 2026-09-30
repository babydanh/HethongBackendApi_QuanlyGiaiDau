import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

/**
 * Danh sách giải của workspace: lọc theo vai trò + phân trang cursor.
 * Kế thừa CursorPaginationDto để dùng chung limit/cursor/direction với các
 * endpoint khác thay vì tự định nghĩa lại.
 */
export class QueryMyWorkspaceDto extends CursorPaginationDto {
  @ApiPropertyOptional({
    default: true,
    description:
      'Bao gồm lịch trận được phân công trọng tài. Tắt khi chỉ cần danh sách giải gọn cho workspace cá nhân.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? true : value === true || value === 'true',
  )
  @IsBoolean()
  includeRefereeMatches = true;
}
