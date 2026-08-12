import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsArray, IsUUID } from 'class-validator';

export enum RoomType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
  SUPPORT = 'SUPPORT',
  CLUB = 'CLUB',
}

export class CreateRoomDto {
  @ApiPropertyOptional({
    example: 'Nhóm Tứ Kết A',
    description: 'Tên nhóm chat (bắt buộc nếu type=GROUP)',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    example: 'GROUP',
    enum: RoomType,
    description: 'Loại phòng chat',
  })
  @IsEnum(RoomType)
  type: RoomType;

  @ApiProperty({
    example: ['uuid-user-1', 'uuid-user-2'],
    description: 'Danh sách ID các thành viên cần add vào nhóm ban đầu',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds: string[];
}
