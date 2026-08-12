import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateRoomDto, RoomType } from './dto/create-room.dto';
import { GetClubRoomQueryDto } from './dto/get-club-room-query.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateSupportConversationDto } from './dto/create-support-conversation.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';
import { SendSupportMessageDto } from './dto/send-support-message.dto';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { QueryChatMessagesDto } from './dto/query-chat-messages.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('rooms')
  @ApiOperation({
    summary:
      'Lấy danh sách các phòng chat của user; với type=CLUB&communityId trả (hoặc lazy-create) phòng chat CLUB của cộng đồng',
  })
  async getMyRooms(
    @Query() query: GetClubRoomQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    // P2D.1: kênh chat CLUB — guard member JOINED + lazy-create room nếu chưa tồn tại.
    if (query.type === RoomType.CLUB) {
      if (!query.communityId) {
        throw new BadRequestException('communityId là bắt buộc khi type=CLUB');
      }
      return this.chatService.getOrCreateClubRoom(query.communityId, user.sub);
    }
    return this.chatService.getUserRooms(user.sub);
  }

  @Post('rooms')
  @ApiOperation({ summary: 'Tạo phòng chat mới (Direct hoặc Group)' })
  async createRoom(
    @Body() createRoomDto: CreateRoomDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.createRoom(user.sub, createRoomDto);
  }

  @Post('messages')
  @UseGuards(new RateLimitGuard(60, 60000))
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
    @Query() query: QueryChatMessagesDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.getMessages(user.sub, id, query.limit, query.cursor);
  }

  @Get('support/me')
  @ApiOperation({ summary: 'Lấy cuộc hội thoại hỗ trợ của người dùng hiện tại' })
  async getMySupportConversation(@CurrentUser() user: JwtPayload) {
    return this.chatService.getMySupportConversation(user.sub);
  }

  @Post('support')
  @UseGuards(new RateLimitGuard(30, 60000))
  @ApiOperation({ summary: 'Mở cuộc hội thoại và gửi tin nhắn cho admin' })
  async openSupportConversation(
    @Body() dto: CreateSupportConversationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.openSupportConversation(user.sub, dto);
  }

  @Get('admin/support/rooms')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Danh sách hội thoại hỗ trợ dành cho admin' })
  async getAdminSupportRooms() {
    return this.chatService.getAdminSupportRooms();
  }

  @Get('admin/support/rooms/:id/messages')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Đọc hội thoại hỗ trợ dành cho admin' })
  async getAdminSupportMessages(@Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.getAdminSupportMessages(id);
  }

  @Post('admin/support/rooms/:id/read')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Mark user support messages as read' })
  async markAdminSupportRoomRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.chatService.markAdminSupportRoomRead(id);
  }

  @Post('admin/support/rooms/:id/messages')
  @UseGuards(new RateLimitGuard(60, 60000))
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiOperation({ summary: 'Admin trả lời hội thoại hỗ trợ' })
  async sendAdminSupportMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendSupportMessageDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.sendAdminSupportMessage(
      user.sub,
      id,
      body.messageText,
    );
  }
}
