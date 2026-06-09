import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ReviewJoinDto {
  @ApiProperty({ description: 'Hành động duyệt hoặc từ chối', enum: ['APPROVE', 'REJECT'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['APPROVE', 'REJECT'])
  action: 'APPROVE' | 'REJECT';
}
