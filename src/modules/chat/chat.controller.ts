import { Controller, Get, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('rooms')
  @ApiOperation({ summary: 'Tạo phòng chat mới (Direct hoặc Group)' })
  async createRoom(
    @Body() createRoomDto: CreateRoomDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.createRoom(user.sub, createRoomDto);
  }

  @Post('messages')
  @ApiOperation({ summary: 'Gửi tin nhắn vào phòng' })
  async sendMessage(
    @Body() createMessageDto: CreateMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.sendMessage(user.sub, createMessageDto);
  }

  @Get('rooms/:id/messages')
  @ApiOperation({ summary: 'Lấy lịch sử tin nhắn của một phòng' })
  async getMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.getMessages(user.sub, id);
  }
}
