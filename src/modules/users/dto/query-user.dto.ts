import { IsOptional, IsInt, Min, IsString, IsEnum, IsDateString, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';
import { UserRole } from '../../../common/constants/enums';

export enum AdminUserStatusFilter {
  ACTIVE = 'ACTIVE',
  BANNED = 'BANNED',
}

export class QueryUserDto extends CursorPaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ default: 'created_at' })
  @IsString()
  @IsOptional()
  sort?: string = 'created_at';

  @ApiPropertyOptional({ default: 'desc' })
  @IsString()
  @IsOptional()
  order?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ enum: UserRole })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({ enum: AdminUserStatusFilter })
  @IsEnum(AdminUserStatusFilter)
  @IsOptional()
  status?: AdminUserStatusFilter;

  @ApiPropertyOptional({ description: 'Inclusive creation-date lower bound (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive creation-date upper bound (YYYY-MM-DD)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  @IsOptional()
  to?: string;
}
