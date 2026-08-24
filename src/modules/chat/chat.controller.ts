import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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

  @Get('direct-policy/:userId')
  @ApiOperation({ summary: 'Kiểm tra quyền nhắn tin riêng trước khi mở phòng' })
  async getDirectMessagePolicy(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.getDirectMessagePolicy(user.sub, userId);
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

  @Put('rooms/:id/read')
  async markRoomRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.chatService.markRoomRead(user.sub, id);
  }

  @Post('rooms/:id/clear')
  @ApiOperation({ summary: 'Xóa lịch sử đoạn chat phía người dùng' })
  async clearRoom(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.clearRoomMessages(user.sub, id);
  }

  @Get('rooms/:id/unread')
  async getUnreadCount(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.chatService.getUnreadCount(user.sub, id);
  }

  @Get('support/me')
  @ApiOperation({ summary: 'Lấy cuộc hội thoại hỗ trợ của người dùng hiện tại' })
  async getMySupportConversation(@CurrentUser() user: JwtPayload) {
    return this.chatService.getMySupportConversation(user.sub);
  }

  @Post('messages/:id/revoke')
  @ApiOperation({ summary: 'Thu hồi tin nhắn' })
  async revokeMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.revokeMessage(user.sub, id);
  }

  @Post('rooms/:roomId/messages/:id/pin')
  @ApiOperation({ summary: 'Ghim tin nhắn lên đầu phòng chat' })
  async pinMessage(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.pinMessage(user.sub, roomId, id);
  }

  @Delete('rooms/:roomId/messages/:id/pin')
  @ApiOperation({ summary: 'Bỏ ghim tin nhắn' })
  async unpinMessage(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.unpinMessage(user.sub, roomId, id);
  }

  @Get('rooms/:roomId/pinned')
  @ApiOperation({ summary: 'Lấy tin nhắn đang được ghim trong phòng' })
  async getPinnedMessage(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.getPinnedMessage(user.sub, roomId);
  }

  @Post('messages/:id/reaction')
  @ApiOperation({ summary: 'Thả hoặc bỏ cảm xúc cho tin nhắn' })
  async toggleReaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { emoji: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.toggleReaction(user.sub, id, body.emoji);
  }

  @Post('messages/:id/poll/vote')
  @ApiOperation({ summary: 'Bình chọn cho một lựa chọn trong Poll' })
  async votePoll(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { optionId: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.votePoll(user.sub, id, body.optionId);
  }

  @Get('link-preview')
  @ApiOperation({ summary: 'Trích xuất thông tin xem trước của liên kết (OpenGraph preview)' })
  async getLinkPreview(@Query('url') url: string) {
    return this.chatService.getLinkPreview(url);
  }

  @Put('rooms/:roomId/settings')
  @ApiOperation({ summary: 'Cập nhật cài đặt phòng chat CLB' })
  async updateClubRoomSettings(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() body: { name?: string; clubAvatar?: string; isAnnouncementOnly?: boolean; slowModeSeconds?: number },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.updateClubRoomSettings(user.sub, roomId, body);
  }

  @Get('blocks')
  async getBlockedUsers(@CurrentUser() user: JwtPayload) {
    return this.chatService.getBlockedUsers(user.sub);
  }

  @Post('blocks/:userId')
  async blockUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.blockUser(user.sub, userId);
  }

  @Delete('blocks/:userId')
  async unblockUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.chatService.unblockUser(user.sub, userId);
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
