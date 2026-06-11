import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryMatchDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, description: 'Số lượng / trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    example: 'uuid-group',
    description: 'Lọc theo Bảng thi đấu (Group)',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    example: 'SCHEDULED',
    description: 'Lọc theo Trạng thái trận đấu',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    example: 'uuid-tournament',
    description: 'Lọc theo Giải đấu (Tournament)',
  })
  @IsOptional()
  @IsUUID()
  tournamentId?: string;

  @ApiPropertyOptional({
    example: 'uuid-tournament',
    description: 'Lọc theo Giải đấu (Tournament) (snake_case)',
  })
  @IsOptional()
  @IsUUID()
  tournament_id?: string;

  @ApiPropertyOptional({
    example: 'uuid-user',
    description: 'Lọc theo User ID tham gia trận đấu',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
