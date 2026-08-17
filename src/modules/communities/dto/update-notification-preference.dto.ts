import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @ApiProperty({
    example: 'MENTIONS_ONLY',
    description: 'Chế độ thông báo: ALL (Tất cả), MENTIONS_ONLY (Chỉ khi được tag @), MUTED (Tắt thông báo)',
    enum: ['ALL', 'MENTIONS_ONLY', 'MUTED'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['ALL', 'MENTIONS_ONLY', 'MUTED'])
  preference: 'ALL' | 'MENTIONS_ONLY' | 'MUTED';
}
