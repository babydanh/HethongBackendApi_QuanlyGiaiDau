import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class QueryMyWorkspaceDto {
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
