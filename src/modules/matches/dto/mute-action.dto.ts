import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export enum MuteType {
  MUTE = 'MUTE',
  BAN = 'BAN',
}

export class MuteActionDto {
  @ApiProperty({ description: 'ID người dùng bị mute/ban', example: 'uuid' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: MuteType, description: 'MUTE = ẩn bình luận, BAN = cấm vĩnh viễn' })
  @IsEnum(MuteType)
  type: 'MUTE' | 'BAN';

  @ApiPropertyOptional({ description: 'Lý do mute/ban' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
