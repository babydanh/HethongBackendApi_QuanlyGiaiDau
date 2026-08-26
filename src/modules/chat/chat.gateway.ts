import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtGuard, extractWsToken } from '../../common/guards/ws-jwt.guard';
import { JwtService } from '@nestjs/jwt';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { ChatMessagePayload } from './interfaces/chat-message-payload.interface';
import { corsOptions } from '../../config/cors.config';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../../common/constants/enums';
import { hasRole } from '../../common/helpers/role.helper';
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
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly supportStaffRoom = 'support:staff';
  private static readonly onlineUsers = new Map<string, Set<string>>();

  public static isUserOnline(userId: string): boolean {
    return ChatGateway.onlineUsers.has(userId) && (ChatGateway.onlineUsers.get(userId)?.size ?? 0) > 0;
  }

  public static getOnlineUserIds(): string[] {
    return Array.from(ChatGateway.onlineUsers.keys());
  }

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly jwtService: JwtService,
  ) {}

  @WebSocketServer()
  server: Server;

  async handleConnection(client: Socket) {
    try {
      const token = extractWsToken(client);
      if (token) {
        const payload = this.jwtService.verify(token) as JwtPayload;
        if (payload?.sub) {
          client.data.user = payload;
          const sockets = ChatGateway.onlineUsers.get(payload.sub) || new Set<string>();
          const wasOffline = sockets.size === 0;
          sockets.add(client.id);
          ChatGateway.onlineUsers.set(payload.sub, sockets);
          if (wasOffline) {
            this.server.emit('chat:user:status', { userId: payload.sub, isOnline: true });
          }
        }
      }
    } catch {
      // Ignored for unauthenticated socket before login
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user as JwtPayload | undefined;
    if (user?.sub) {
      const sockets = ChatGateway.onlineUsers.get(user.sub);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          ChatGateway.onlineUsers.delete(user.sub);
          this.server.emit('chat:user:status', {
            userId: user.sub,
            isOnline: false,
            lastActiveAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  @SubscribeMessage('checkOnlineUsers')
  handleCheckOnlineUsers(@MessageBody() userIds: string[]) {
    if (!Array.isArray(userIds)) return {};
    const result: Record<string, boolean> = {};
    for (const id of userIds) {
      result[id] = ChatGateway.onlineUsers.has(id);
    }
    return result;
  }

  @SubscribeMessage('joinChatRoom')
  async handleJoinRoom(
    @MessageBody() payload: string | { roomId?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId =
      typeof payload === 'object' && payload && 'roomId' in payload
        ? (payload as { roomId?: string }).roomId
        : String(payload || '');

    if (!roomId) {
      return { event: 'chat:error', data: 'Invalid roomId' };
    }

    let user = client.data.user as JwtPayload | undefined;
    if (!user?.sub) {
      const token = extractWsToken(client);
      if (token) {
        try {
          user = this.jwtService.verify(token) as JwtPayload;
          client.data.user = user;
        } catch {
          // ignore
        }
      }
    }

    const isSupportStaff =
      hasRole(user, UserRole.ADMIN) || hasRole(user, UserRole.MODERATOR);
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
    const canManageSupport =
      hasRole(user, UserRole.ADMIN) || hasRole(user, UserRole.MODERATOR);

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
      // Người nhận không nhận tin nhắn người lạ và người gửi không quen nhau.
      // (Dùng repository trực tiếp — tránh vòng DI ChatService ↔ ChatGateway.)
      if (otherUserId) {
        const allowStrangers = await this.chatRepository.getAllowStrangerMessages(otherUserId);
        const acquainted = allowStrangers || await this.chatRepository.isAcquainted(user.sub, otherUserId);
        if (!acquainted) {
          return { event: 'chat:error', data: 'Người dùng này không nhận tin nhắn từ người lạ.' };
        }
      }
    }
    const persisted = await this.chatRepository.saveMessage(user.sub, { roomId: payload.roomId, messageText: payload.content.trim() });
    const messagePayload = { ...persisted, content: persisted.messageText, timestamp: persisted.createdAt.toISOString() };
    if (room.type === 'CLUB') this.broadcastClubMessage(payload.roomId, messagePayload);
    else {
      this.broadcastMessage(payload.roomId, messagePayload);
      const memberIds = await this.chatRepository.getRoomMemberIds(payload.roomId);
      for (const memberId of memberIds) {
        if (memberId !== user.sub) this.notifyDirectRoomUpdated(memberId, payload.roomId);
      }
    }
    return { event: 'messageSent', data: messagePayload };
  }

  broadcastMessage(roomId: string, message: ChatMessagePayload) {
    this.server.to(`chat:${roomId}`).emit('chat:message', message);
  }

  /** Notify an online recipient that a direct room is now available. */
  notifyDirectRoomCreated(userId: string, roomId: string) {
    this.notifyDirectRoomEvent(userId, 'chat:room:created', roomId);
  }

  /** Notify an online recipient that an existing direct room has new activity. */
  notifyDirectRoomUpdated(userId: string, roomId: string) {
    this.notifyDirectRoomEvent(userId, 'chat:room:updated', roomId);
  }

  private notifyDirectRoomEvent(userId: string, event: 'chat:room:created' | 'chat:room:updated', roomId: string) {
    const socketIds = ChatGateway.onlineUsers.get(userId);
    if (!socketIds) return;
    for (const socketId of socketIds) {
      this.server.to(socketId).emit(event, { roomId });
    }
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

    const isSupportStaff =
      hasRole(user, UserRole.ADMIN) || hasRole(user, UserRole.MODERATOR);
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

  broadcastPollVoted(roomId: string, messageId: string, metadata: unknown) {
    this.server.to(`chat:${roomId}`).emit('chat:poll:voted', { roomId, messageId, metadata });
  }

  broadcastRoomRead(roomId: string, userId: string, readAt: string) {
    this.server.to(`chat:${roomId}`).emit('chat:room:read', { roomId, userId, readAt });
  }
}
