import { ChatService } from './chat.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { GetClubRoomQueryDto } from './dto/get-club-room-query.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateSupportConversationDto } from './dto/create-support-conversation.dto';
import { SendSupportMessageDto } from './dto/send-support-message.dto';
import { QueryChatMessagesDto } from './dto/query-chat-messages.dto';
export declare class ChatController {
    private readonly chatService;
    constructor(chatService: ChatService);
    getMyRooms(query: GetClubRoomQueryDto, user: JwtPayload): Promise<{
        id: string;
        name: string | null;
        type: string;
        createdAt: Date;
        participants: {
            id: string;
            fullName: string | null;
            avatarUrl: string | null;
        }[];
        lastMessage?: {
            id: string;
            senderId: string | null;
            sender: {
                id: string | null;
                fullName: string;
                avatarUrl?: string;
            };
            content: string;
            createdAt: string;
        } | undefined;
        updatedAt: string;
        unreadCount: number;
        communityId: string | null;
    }[] | {
        members: {
            id: string;
            fullName: string | null;
            avatarUrl: string | null;
            role: string;
            tags: string[];
        }[];
        id: string;
        name: string | null;
        createdAt: Date;
        communityId: string | null;
        type: string;
        clubName: string | null;
        clubAvatar: string | null;
        isAnnouncementOnly: boolean;
        slowModeSeconds: number;
        pinnedMessageId: string | null;
    }>;
    createRoom(createRoomDto: CreateRoomDto, user: JwtPayload): Promise<{
        id: string;
        name: string | null;
        type: string;
        createdAt: Date;
        participants: {
            id: string;
            fullName: string | null;
            avatarUrl: string | null;
        }[];
        lastMessage?: {
            id: string;
            senderId: string | null;
            sender: {
                id: string | null;
                fullName: string;
                avatarUrl?: string;
            };
            content: string;
            createdAt: string;
        } | undefined;
        updatedAt: string;
        unreadCount: number;
        communityId: string | null;
    } | {
        id: string;
        name: string | null;
        createdAt: Date;
        communityId: string | null;
        type: string;
        clubName: string | null;
        clubAvatar: string | null;
        isAnnouncementOnly: boolean;
        slowModeSeconds: number;
        pinnedMessageId: string | null;
    }>;
    sendMessage(createMessageDto: CreateMessageDto, user: JwtPayload): Promise<{
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
        senderId: string | null;
        isRead: boolean;
        isRevoked: boolean;
        revokedAt: Date | null;
        metadata: unknown;
        roomId: string;
        messageText: string | null;
        attachmentsUrls: string[];
        clientMessageId: string | null;
        revokedBy: string | null;
        replyToId: string | null;
        isPinned: boolean;
        pinnedBy: string | null;
        pinnedAt: Date | null;
    }>;
    getMessages(id: string, query: QueryChatMessagesDto, user: JwtPayload): Promise<{
        data: {
            reactions: string[];
            replyTo: {
                id: string;
                senderName: string;
                text: string;
            } | null;
            id: string;
            roomId: string;
            senderId: string | null;
            messageText: string | null;
            attachmentsUrls: string[];
            type: string;
            metadata: unknown;
            isRead: boolean;
            isRevoked: boolean;
            isPinned: boolean;
            replyToId: string | null;
            createdAt: Date;
            senderName: string;
            senderAvatar: string | null;
            senderAvatarUrl: string | null;
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    }>;
    markRoomRead(id: string, user: JwtPayload): Promise<{
        id: string;
        userId: string;
        roomId: string;
        lastReadAt: Date;
    }>;
    clearRoom(id: string, user: JwtPayload): Promise<boolean>;
    getUnreadCount(id: string, user: JwtPayload): Promise<{
        count: number;
    }>;
    getMySupportConversation(user: JwtPayload): Promise<{
        messages: {
            id: string;
            roomId: string;
            senderId: string | null;
            messageText: string | null;
            attachmentsUrls: string[];
            type: string;
            metadata: unknown;
            isRead: boolean;
            isRevoked: boolean;
            isPinned: boolean;
            replyToId: string | null;
            createdAt: Date;
            senderName: string;
            senderAvatar: string | null;
            senderAvatarUrl: string | null;
        }[];
        id: string;
        name: string | null;
        type: string;
        createdAt: Date;
    } | null>;
    revokeMessage(id: string, user: JwtPayload): Promise<{
        id: string;
        roomId: string;
        senderId: string | null;
        messageText: string | null;
        attachmentsUrls: string[];
        type: string;
        metadata: unknown;
        clientMessageId: string | null;
        isRead: boolean;
        isRevoked: boolean;
        revokedBy: string | null;
        revokedAt: Date | null;
        replyToId: string | null;
        isPinned: boolean;
        pinnedBy: string | null;
        pinnedAt: Date | null;
        createdAt: Date;
    }>;
    pinMessage(roomId: string, id: string, user: JwtPayload): Promise<{
        success: boolean;
        messageId: string;
        pinnedAt: Date;
    }>;
    unpinMessage(roomId: string, id: string, user: JwtPayload): Promise<{
        success: boolean;
        messageId: string;
    }>;
    getPinnedMessage(roomId: string, user: JwtPayload): Promise<{
        id: string;
        roomId: string;
        messageText: string | null;
        attachmentsUrls: string[];
        createdAt: Date;
        senderName: string;
        senderAvatar: string | null;
    } | null>;
    toggleReaction(id: string, body: {
        emoji: string;
    }, user: JwtPayload): Promise<{
        reactions: string[];
    }>;
    votePoll(id: string, body: {
        optionId: string;
    }, user: JwtPayload): Promise<{
        messageId: string;
        roomId: string;
        metadata: {
            options: {
                voterIds: string[];
                id: string;
                text: string;
            }[];
            question: string;
            allowMultiple?: boolean;
            isClosed?: boolean;
        };
        message: {
            id: string;
            roomId: string;
            senderId: string | null;
            messageText: string | null;
            attachmentsUrls: string[];
            type: string;
            metadata: unknown;
            clientMessageId: string | null;
            isRead: boolean;
            isRevoked: boolean;
            revokedBy: string | null;
            revokedAt: Date | null;
            replyToId: string | null;
            isPinned: boolean;
            pinnedBy: string | null;
            pinnedAt: Date | null;
            createdAt: Date;
        };
    }>;
    getLinkPreview(url: string): Promise<{
        data: import("./utils/link-preview.util").LinkPreviewData | null;
    }>;
    updateClubRoomSettings(roomId: string, body: {
        name?: string;
        clubAvatar?: string;
        isAnnouncementOnly?: boolean;
        slowModeSeconds?: number;
    }, user: JwtPayload): Promise<{
        id: string;
        name: string | null;
        type: string;
        communityId: string | null;
        clubName: string | null;
        clubAvatar: string | null;
        isAnnouncementOnly: boolean;
        slowModeSeconds: number;
        pinnedMessageId: string | null;
        createdAt: Date;
    }>;
    getBlockedUsers(user: JwtPayload): Promise<{
        id: string;
        blockedId: string;
        createdAt: Date;
        fullName: string | null;
        avatarUrl: string | null;
    }[]>;
    blockUser(userId: string, user: JwtPayload): Promise<{
        id: string;
        createdAt: Date;
        blockerId: string;
        blockedId: string;
    }>;
    unblockUser(userId: string, user: JwtPayload): Promise<{
        success: boolean;
    }>;
    openSupportConversation(dto: CreateSupportConversationDto, user: JwtPayload): Promise<{
        messages: {
            id: string;
            roomId: string;
            senderId: string | null;
            messageText: string | null;
            attachmentsUrls: string[];
            type: string;
            metadata: unknown;
            isRead: boolean;
            isRevoked: boolean;
            isPinned: boolean;
            replyToId: string | null;
            createdAt: Date;
            senderName: string;
            senderAvatar: string | null;
            senderAvatarUrl: string | null;
        }[];
        id: string;
        name: string | null;
        type: string;
        createdAt: Date;
    }>;
    getAdminSupportRooms(): Promise<{
        participants: {
            id: string;
            email: string;
            fullName: string | null;
            avatarUrl: string | null;
        }[];
        unreadCount: number;
        lastMessage: {
            id: string;
            senderId: string | null;
            senderName: string | null;
            content: string;
            createdAt: string;
        } | null;
        updatedAt: string;
        id: string;
        name: string | null;
        type: string;
        createdAt: Date;
    }[]>;
    getAdminSupportMessages(id: string): Promise<{
        id: string;
        roomId: string;
        senderId: string | null;
        messageText: string | null;
        attachmentsUrls: string[];
        type: string;
        metadata: unknown;
        isRead: boolean;
        isRevoked: boolean;
        isPinned: boolean;
        replyToId: string | null;
        createdAt: Date;
        senderName: string;
        senderAvatar: string | null;
        senderAvatarUrl: string | null;
    }[]>;
    markAdminSupportRoomRead(id: string): Promise<{
        success: boolean;
    }>;
    sendAdminSupportMessage(id: string, body: SendSupportMessageDto, user: JwtPayload): Promise<{
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
        senderId: string | null;
        isRead: boolean;
        isRevoked: boolean;
        revokedAt: Date | null;
        metadata: unknown;
        roomId: string;
        messageText: string | null;
        attachmentsUrls: string[];
        clientMessageId: string | null;
        revokedBy: string | null;
        replyToId: string | null;
        isPinned: boolean;
        pinnedBy: string | null;
        pinnedAt: Date | null;
    }>;
}
