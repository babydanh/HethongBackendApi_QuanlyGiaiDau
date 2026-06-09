import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class SendChatMessageDto {
  @IsUUID()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}
