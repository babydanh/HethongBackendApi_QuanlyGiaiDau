import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestSocialPickupDto {
  @ApiPropertyOptional({ maxLength: 500, description: 'Ghi chú gửi tới host khi xin tham gia' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
