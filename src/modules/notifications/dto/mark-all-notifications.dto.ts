import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class MarkAllNotificationsDto {
  @ApiPropertyOptional({
    enum: ['player', 'management'],
    default: 'player',
    description: 'Phạm vi nghiệp vụ cần đánh dấu đã đọc',
  })
  @IsOptional()
  @IsIn(['player', 'management'])
  scope: 'player' | 'management' = 'player';
}
