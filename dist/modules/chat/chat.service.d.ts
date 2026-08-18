import { ChatRepository } from './chat.repository';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ChatGateway } from './chat.gateway';
import { CreateSupportConversationDto } from './dto/create-support-conversation.dto';
import { FirebaseService } from '../firebase/firebase.service';
export declare class ChatService {
    private readonly chatRepository;
    private readonly chatGateway;
    private readonly firebaseService;
    constructor(chatRepository: ChatRepository, chatGateway: ChatGateway, firebaseService: FirebaseService);
    getUserRooms(userId: string): Promise<{
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
    }[]>;
    private assertDirectRoomAccess;
    assertCanDirectMessage(fromUserId: string, toUserId: string): Promise<void>;
    createRoom(userId: string, data: CreateRoomDto): Promise<{
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
        type: string;
        name: string | null;
        communityId: string | null;
        id: string;
        createdAt: Date;
        clubName: string | null;
        clubAvatar: string | null;
        isAnnouncementOnly: boolean;
        slowModeSeconds: number;
        pinnedMessageId: string | null;
    }>;
    getOrCreateClubRoom(communityId: string, userId: string): Promise<{
        members: {
            id: string;
            fullName: string | null;
            avatarUrl: string | null;
            role: string;
            tags: string[];
        }[];
        type: string;
        name: string | null;
        communityId: string | null;
        id: string;
        createdAt: Date;
        clubName: string | null;
        clubAvatar: string | null;
        isAnnouncementOnly: boolean;
        slowModeSeconds: number;
        pinnedMessageId: string | null;
    }>;
    assertClubMember(communityId: string, userId: string): Promise<{
        id: string;
        communityId: string;
        userId: string;
        role: string;
        status: string;
        invitedBy: string | null;
        joinAnswers: Record<string, string> | null;
        tags: string[];
        notificationPreference: string;
        approvedBy: string | null;
        approvedAt: Date | null;
        joinedAt: Date;
    }>;
    sendMessage(userId: string, data: CreateMessageDto): Promise<{
        senderName: string;
        senderAvatar: string | null;
        senderAvatarUrl: string | null;
        replyTo: {
            id: string;
            senderName: string;
            text: string;
        } | null;
        reactions: never[];
        type: string;
        id: string;
        createdAt: Date;
        senderId: string | null;
        isRead: boolean;
        roomId: string;
        messageText: string | null;
        attachmentsUrls: string[];
        metadata: unknown;
        clientMessageId: string | null;
        isRevoked: boolean;
        revokedBy: string | null;
        revokedAt: Date | null;
        replyToId: string | null;
        isPinned: boolean;
        pinnedBy: string | null;
        pinnedAt: Date | null;
    }>;
    getMessages(userId: string, roomId: string, limit?: number, cursor?: string): Promise<{
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
    clearRoomMessages(userId: string, roomId: string): Promise<boolean>;
    revokeMessage(userId: string, messageId: string): Promise<{
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
    pinMessage(userId: string, roomId: string, messageId: string): Promise<{
        success: boolean;
        messageId: string;
        pinnedAt: Date;
    }>;
    unpinMessage(userId: string, roomId: string, messageId: string): Promise<{
        success: boolean;
        messageId: string;
    }>;
    getPinnedMessage(userId: string, roomId: string): Promise<{
        id: string;
        roomId: string;
        messageText: string | null;
        attachmentsUrls: string[];
        createdAt: Date;
        senderName: string;
        senderAvatar: string | null;
    } | null>;
    toggleReaction(userId: string, messageId: string, emoji: string): Promise<{
        reactions: string[];
    }>;
    updateClubRoomSettings(userId: string, roomId: string, data: {
        name?: string;
        clubAvatar?: string;
        isAnnouncementOnly?: boolean;
        slowModeSeconds?: number;
    }): Promise<{
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
    markRoomRead(userId: string, roomId: string): Promise<{
        id: string;
        userId: string;
        roomId: string;
        lastReadAt: Date;
    }>;
    getUnreadCount(userId: string, roomId: string): Promise<{
        count: number;
    }>;
    blockUser(blockerId: string, blockedId: string): Promise<{
        id: string;
        createdAt: Date;
        blockerId: string;
        blockedId: string;
    }>;
    unblockUser(blockerId: string, blockedId: string): Promise<{
        success: boolean;
    }>;
    getBlockedUsers(blockerId: string): Promise<{
        id: string;
        blockedId: string;
        createdAt: Date;
        fullName: string | null;
        avatarUrl: string | null;
    }[]>;
    getMySupportConversation(userId: string): Promise<{
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
    openSupportConversation(userId: string, data: CreateSupportConversationDto): Promise<{
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
    getAdminSupportMessages(roomId: string): Promise<{
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
    markAdminSupportRoomRead(roomId: string): Promise<{
        success: boolean;
    }>;
    sendAdminSupportMessage(adminId: string, roomId: string, messageText: string): Promise<{
        senderName: string;
        senderAvatar: string | null;
        senderAvatarUrl: string | null;
        replyTo: {
            id: string;
            senderName: string;
            text: string;
        } | null;
        reactions: never[];
        type: string;
        id: string;
        createdAt: Date;
        senderId: string | null;
        isRead: boolean;
        roomId: string;
        messageText: string | null;
        attachmentsUrls: string[];
        metadata: unknown;
        clientMessageId: string | null;
        isRevoked: boolean;
        revokedBy: string | null;
        revokedAt: Date | null;
        replyToId: string | null;
        isPinned: boolean;
        pinnedBy: string | null;
        pinnedAt: Date | null;
    }>;
    votePoll(userId: string, messageId: string, optionId: string): Promise<{
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
    private ensureSupportRoom;
}
