import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ToggleReactionDto {
  @ApiProperty({ example: '❤️', description: 'Emoji cảm xúc (❤️, 👍, 😂, 😮, 😢, 🔥,...)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  emoji: string;
}
