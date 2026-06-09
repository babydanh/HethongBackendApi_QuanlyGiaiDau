import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';

export class UpdateMatchStatusDto {
  @ApiProperty({
    example: 'ONGOING',
    description: 'Trạng thái mới của trận đấu',
  })
  @IsString()
  @IsIn(['SCHEDULED', 'ONGOING', 'COMPLETED', 'DISPUTED'])
  status: string;
}
