import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard } from '../../common/guards/ws-jwt.guard';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { ChatMessagePayload } from './interfaces/chat-message-payload.interface';
import { corsOptions } from '../../config/cors.config';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../common/constants/enums';
import { ChatRepository } from './chat.repository';

interface SupportTypingPayload {
  roomId: string;
  isTyping: boolean;
}
interface ClubTypingPayload { roomId: string; isTyping: boolean; }

@WebSocketGateway({
  cors: corsOptions,
  namespace: '/chat',
})
@UseGuards(WsJwtGuard)
export class ChatGateway {
  private readonly supportStaffRoom = 'support:staff';

  constructor(private readonly chatRepository: ChatRepository) {}

  @WebSocketServer()
  server: Server;

  @SubscribeMessage('joinChatRoom')
  async handleJoinRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user as JwtPayload | undefined;
    const roles = user?.roles ?? (user?.role ? [user.role] : []);
    const isSupportStaff = roles.some(
      (role) => role === UserRole.ADMIN || role === UserRole.MODERATOR,
    );
    // P2D.1: room CLUB kiểm tra qua membership cộng đồng (JOINED), các loại khác qua chat_room_members.
    const isMember = user?.sub
      ? await this.chatRepository.canAccessRoom(roomId, user.sub)
      : false;
    const roomRecord = !isMember && isSupportStaff
      ? await this.chatRepository.findRoomById(roomId)
      : null;

    if (!isMember && (!roomRecord || roomRecord.type !== 'SUPPORT')) {
      return { event: 'chat:error', data: 'Forbidden' };
    }

    const room = `chat:${roomId}`;
    client.join(room);
    return { event: 'joined', data: room };
  }

  @SubscribeMessage('leaveChatRoom')
  handleLeaveRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const room = `chat:${roomId}`;
    client.leave(room);
    return { event: 'left', data: room };
  }

  @SubscribeMessage('subscribeSupportInbox')
  handleSubscribeSupportInbox(@ConnectedSocket() client: Socket) {
    const user = client.data.user as JwtPayload | undefined;
    const roles = user?.roles ?? (user?.role ? [user.role] : []);
    const canManageSupport = roles.some(
      (role) => role === UserRole.ADMIN || role === UserRole.MODERATOR,
    );

    if (!canManageSupport) {
      return { event: 'support:error', data: 'Forbidden' };
    }

    client.join(this.supportStaffRoom);
    return { event: 'support:subscribed', data: this.supportStaffRoom };
  }

  @SubscribeMessage('subscribeMySupport')
  async handleSubscribeMySupport(@ConnectedSocket() client: Socket) {
    const user = client.data.user as JwtPayload | undefined;
    if (!user?.sub) {
      return { event: 'support:error', data: 'Unauthorized' };
    }

    const supportRoom = await this.chatRepository.findSupportRoomForUser(user.sub);
    if (!supportRoom) {
      return { event: 'support:subscribed', data: null };
    }

    const room = `chat:${supportRoom.id}`;
    client.join(room);
    return {
      event: 'support:subscribed',
      data: { roomId: supportRoom.id, room },
    };
  }

  @SubscribeMessage('sendMessage')
  handleMessage(
    @MessageBody() payload: SendChatMessageDto,
    @ConnectedSocket() client: Socket,
  ) {
    return this.persistAndBroadcastMessage(payload, client);
  }

  private async persistAndBroadcastMessage(payload: SendChatMessageDto, client: Socket) {
    const user = client.data.user as JwtPayload | undefined;
    if (!user?.sub || !payload?.content?.trim()) return { event: 'chat:error', data: 'Invalid message' };
    const room = await this.chatRepository.findRoomById(payload.roomId);
    const canAccess = await this.chatRepository.canAccessRoom(payload.roomId, user.sub);
    if (!room || !canAccess) return { event: 'chat:error', data: 'Forbidden' };
    if (room.type === 'DIRECT') {
      const otherUserId = (await this.chatRepository.getRoomMemberIds(payload.roomId))
        .find((memberId) => memberId !== user.sub);
      if (otherUserId && await this.chatRepository.isBlockedBetween(user.sub, otherUserId)) {
        return { event: 'chat:error', data: 'Blocked' };
      }
    }
    const persisted = await this.chatRepository.saveMessage(user.sub, { roomId: payload.roomId, messageText: payload.content.trim() });
    const messagePayload = { ...persisted, content: persisted.messageText, timestamp: persisted.createdAt.toISOString() };
    if (room.type === 'CLUB') this.broadcastClubMessage(payload.roomId, messagePayload);
    else this.broadcastMessage(payload.roomId, messagePayload);
    return { event: 'messageSent', data: messagePayload };
  }

  broadcastMessage(roomId: string, message: ChatMessagePayload) {
    this.server.to(`chat:${roomId}`).emit('chat:message', message);
  }

  /** P2D.1 — Sự kiện riêng cho kênh chat CLUB (payload kèm senderTags). */
  broadcastClubMessage(roomId: string, message: ChatMessagePayload) {
    this.server.to(`chat:${roomId}`).emit('chat:club:message', message);
  }

  @SubscribeMessage('supportTyping')
  async handleSupportTyping(
    @MessageBody() payload: SupportTypingPayload,
    @ConnectedSocket() client: Socket,
  ) {
    if (
      !payload?.roomId ||
      typeof payload.isTyping !== 'boolean'
    ) {
      return { event: 'support:error', data: 'Invalid typing payload' };
    }

    const user = client.data.user as JwtPayload | undefined;
    if (!user?.sub) {
      return { event: 'support:error', data: 'Unauthorized' };
    }

    const roles = user.roles ?? (user.role ? [user.role] : []);
    const isSupportStaff = roles.some(
      (role) => role === UserRole.ADMIN || role === UserRole.MODERATOR,
    );
    const isMember = await this.chatRepository.isMemberOfRoom(
      payload.roomId,
      user.sub,
    );
    const room = !isMember && isSupportStaff
      ? await this.chatRepository.findRoomById(payload.roomId)
      : null;

    if (!isMember && (!room || room.type !== 'SUPPORT')) {
      return { event: 'support:error', data: 'Forbidden' };
    }

    client.to(`chat:${payload.roomId}`).emit('support:typing', {
      roomId: payload.roomId,
      userId: user.sub,
      isTyping: payload.isTyping,
      isSupportStaff,
    });

    return {
      event: 'support:typing:ack',
      data: { roomId: payload.roomId, isTyping: payload.isTyping },
    };
  }

  @SubscribeMessage('typing')
  async handleClubTyping(@MessageBody() payload: ClubTypingPayload, @ConnectedSocket() client: Socket) {
    const user = client.data.user as JwtPayload | undefined;
    if (!user?.sub || !payload?.roomId || typeof payload.isTyping !== 'boolean') return { event: 'chat:error', data: 'Invalid typing payload' };
    if (!(await this.chatRepository.canAccessRoom(payload.roomId, user.sub))) return { event: 'chat:error', data: 'Forbidden' };
    client.to(`chat:${payload.roomId}`).emit('chat:typing', { roomId: payload.roomId, userId: user.sub, isTyping: payload.isTyping });
    return { event: 'typing:ack', data: payload };
  }

  broadcastSupportMessage(roomId: string, message: ChatMessagePayload) {
    this.broadcastMessage(roomId, message);
    this.server.to(this.supportStaffRoom).emit('support:message', {
      roomId,
      message,
    });
  }

  broadcastSupportRead(roomId: string) {
    this.server.to(this.supportStaffRoom).emit('support:read', { roomId });
  }

  broadcastMessageRevoked(roomId: string, messageId: string, revokedBy: string) {
    this.server.to(`chat:${roomId}`).emit('chat:message:revoked', { roomId, messageId, revokedBy });
  }

  broadcastMessagePinned(roomId: string, messageId: string, pinnedBy: string, pinnedMessage?: unknown) {
    this.server.to(`chat:${roomId}`).emit('chat:message:pinned', { roomId, messageId, pinnedBy, pinnedMessage });
  }

  broadcastMessageUnpinned(roomId: string, messageId: string, unpinnedBy: string) {
    this.server.to(`chat:${roomId}`).emit('chat:message:unpinned', { roomId, messageId, unpinnedBy });
  }

  broadcastMessageReaction(roomId: string, messageId: string, userId: string, emoji: string, reactions: string[]) {
    this.server.to(`chat:${roomId}`).emit('chat:message:reaction', { roomId, messageId, userId, emoji, reactions });
  }

  broadcastRoomUpdated(roomId: string, room: unknown) {
    this.server.to(`chat:${roomId}`).emit('chat:room:updated', { roomId, room });
  }
}
