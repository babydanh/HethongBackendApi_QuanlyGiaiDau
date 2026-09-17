import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ShareCommunityActivityDto {
  @ApiPropertyOptional({ description: 'Buổi giao lưu CLB đã tồn tại' })
  @IsOptional()
  @IsUUID()
  clubMatchSessionId?: string;

  @ApiPropertyOptional({ description: 'Giải CLB đã tồn tại' })
  @IsOptional()
  @IsUUID()
  tournamentId?: string;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  body?: string;
}
