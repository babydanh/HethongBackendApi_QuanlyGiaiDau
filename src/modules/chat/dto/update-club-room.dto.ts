import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';

export class UpdateClubRoomDto {
  @ApiPropertyOptional({ description: 'Tên hiển thị mới của phòng chat' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Avatar mới của phòng chat CLB' })
  @IsString()
  @IsOptional()
  clubAvatar?: string;

  @ApiPropertyOptional({ description: 'Chế độ chỉ Ban Quản Trị được gửi tin' })
  @IsBoolean()
  @IsOptional()
  isAnnouncementOnly?: boolean;

  @ApiPropertyOptional({ description: 'Số giây giãn cách giữa các tin nhắn (slow mode)' })
  @IsInt()
  @Min(0)
  @Max(3600)
  @IsOptional()
  slowModeSeconds?: number;
}
