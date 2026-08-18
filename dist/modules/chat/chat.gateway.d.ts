import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { SendChatMessageDto } from './dto/send-chat-message.dto';
import { ChatMessagePayload } from './interfaces/chat-message-payload.interface';
import { ChatRepository } from './chat.repository';
interface SupportTypingPayload {
    roomId: string;
    isTyping: boolean;
}
interface ClubTypingPayload {
    roomId: string;
    isTyping: boolean;
}
export declare class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly chatRepository;
    private readonly jwtService;
    private readonly supportStaffRoom;
    private static readonly onlineUsers;
    constructor(chatRepository: ChatRepository, jwtService: JwtService);
    server: Server;
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): void;
    handleCheckOnlineUsers(userIds: string[]): Record<string, boolean>;
    handleJoinRoom(payload: string | {
        roomId?: string;
    }, client: Socket): Promise<{
        event: string;
        data: string;
    }>;
    handleLeaveRoom(roomId: string, client: Socket): {
        event: string;
        data: string;
    };
    handleSubscribeSupportInbox(client: Socket): {
        event: string;
        data: string;
    };
    handleSubscribeMySupport(client: Socket): Promise<{
        event: string;
        data: string;
    } | {
        event: string;
        data: null;
    } | {
        event: string;
        data: {
            roomId: string;
            room: string;
        };
    }>;
    handleMessage(payload: SendChatMessageDto, client: Socket): Promise<{
        event: string;
        data: string;
    } | {
        event: string;
        data: {
            content: string | null;
            timestamp: string;
            senderName: string;
            senderAvatar: string | null;
            senderAvatarUrl: string | null;
            replyTo: {
                id: string;
                senderName: string;
                text: string;
            } | null;
            reactions: never[];
            id: string;
            createdAt: Date;
            type: string;
            metadata: unknown;
            isRevoked: boolean;
            revokedAt: Date | null;
            senderId: string | null;
            isRead: boolean;
            roomId: string;
            messageText: string | null;
            attachmentsUrls: string[];
            clientMessageId: string | null;
            revokedBy: string | null;
            replyToId: string | null;
            isPinned: boolean;
            pinnedBy: string | null;
            pinnedAt: Date | null;
        };
    }>;
    private persistAndBroadcastMessage;
    broadcastMessage(roomId: string, message: ChatMessagePayload): void;
    broadcastClubMessage(roomId: string, message: ChatMessagePayload): void;
    handleSupportTyping(payload: SupportTypingPayload, client: Socket): Promise<{
        event: string;
        data: string;
    } | {
        event: string;
        data: {
            roomId: string;
            isTyping: boolean;
        };
    }>;
    handleClubTyping(payload: ClubTypingPayload, client: Socket): Promise<{
        event: string;
        data: string;
    } | {
        event: string;
        data: ClubTypingPayload;
    }>;
    broadcastSupportMessage(roomId: string, message: ChatMessagePayload): void;
    broadcastSupportRead(roomId: string): void;
    broadcastMessageRevoked(roomId: string, messageId: string, revokedBy: string): void;
    broadcastMessagePinned(roomId: string, messageId: string, pinnedBy: string, pinnedMessage?: unknown): void;
    broadcastMessageUnpinned(roomId: string, messageId: string, unpinnedBy: string): void;
    broadcastMessageReaction(roomId: string, messageId: string, userId: string, emoji: string, reactions: string[]): void;
    broadcastRoomUpdated(roomId: string, room: unknown): void;
    broadcastPollVoted(roomId: string, messageId: string, metadata: unknown): void;
    broadcastRoomRead(roomId: string, userId: string, readAt: string): void;
}
export {};
