import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { RoomType } from './create-room.dto';

export class GetClubRoomQueryDto {
  @ApiPropertyOptional({
    enum: RoomType,
    description: 'Loại phòng chat — chỉ hỗ trợ type=CLUB kèm communityId',
  })
  @IsEnum(RoomType)
  @IsOptional()
  type?: RoomType;

  @ApiPropertyOptional({
    example: 'uuid-community-id',
    description: 'ID cộng đồng (bắt buộc khi type=CLUB)',
  })
  @IsUUID()
  @IsOptional()
  communityId?: string;
}
