import { IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddLiteClubMemberDto {
  @ApiProperty({
    description: 'ID user của thành viên CLB đang ở trạng thái JOINED',
  })
  @IsUUID('4')
  userId: string;
  @ApiPropertyOptional({
    description: 'ID nội dung thi đấu đã chọn cho thành viên',
  })
  @IsOptional()
  @IsUUID('4')
  divisionId?: string;
}
