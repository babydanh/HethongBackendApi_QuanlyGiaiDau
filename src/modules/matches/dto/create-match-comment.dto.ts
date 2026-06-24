import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateMatchCommentDto {
  @ApiProperty({
    description: 'Nội dung bình luận trận đấu',
    example: 'Trận này đang rất căng!',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  commentText: string;
}
