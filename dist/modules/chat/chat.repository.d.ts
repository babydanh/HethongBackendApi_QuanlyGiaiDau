import type { AppDb } from '../../database/db.types';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateMessageDto } from './dto/create-message.dto';
export declare class ChatRepository {
    private readonly db;
    constructor(db: AppDb);
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
        };
        updatedAt: string;
        unreadCount: number;
        communityId: string | null;
    }[]>;
    getUserRoomById(userId: string, roomId: string): Promise<{
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
        };
        updatedAt: string;
        unreadCount: number;
        communityId: string | null;
    } | null>;
    createRoomWithMembers(data: CreateRoomDto): Promise<{
        id: string;
        name: string | null;
        createdAt: Date;
        type: string;
        communityId: string | null;
        clubName: string | null;
        clubAvatar: string | null;
        isAnnouncementOnly: boolean;
        slowModeSeconds: number;
        pinnedMessageId: string | null;
    }>;
    findDirectRoomBetween(firstUserId: string, secondUserId: string): Promise<{
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
    } | null>;
    getOrCreateDirectRoom(firstUserId: string, secondUserId: string): Promise<{
        id: string;
        name: string | null;
        createdAt: Date;
        type: string;
        communityId: string | null;
        clubName: string | null;
        clubAvatar: string | null;
        isAnnouncementOnly: boolean;
        slowModeSeconds: number;
        pinnedMessageId: string | null;
    }>;
    isMemberOfRoom(roomId: string, userId: string): Promise<boolean>;
    getRoomMemberIds(roomId: string): Promise<string[]>;
    isActiveUser(userId: string): Promise<boolean>;
    isBlockedBetween(firstUserId: string, secondUserId: string): Promise<boolean>;
    getAllowStrangerMessages(userId: string): Promise<boolean>;
    isAcquainted(firstUserId: string, secondUserId: string): Promise<boolean>;
    createBlock(blockerId: string, blockedId: string): Promise<{
        id: string;
        createdAt: Date;
        blockerId: string;
        blockedId: string;
    }>;
    deleteBlock(blockerId: string, blockedId: string): Promise<boolean>;
    getBlocks(blockerId: string): Promise<{
        id: string;
        blockedId: string;
        createdAt: Date;
        fullName: string | null;
        avatarUrl: string | null;
    }[]>;
    findCommunityMember(communityId: string, userId: string): Promise<{
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
    canAccessRoom(roomId: string, userId: string): Promise<boolean>;
    isClubChatEnabled(communityId: string): Promise<boolean>;
    getOrCreateClubRoom(communityId: string): Promise<{
        id: string;
        name: string | null;
        createdAt: Date;
        type: string;
        communityId: string | null;
        clubName: string | null;
        clubAvatar: string | null;
        isAnnouncementOnly: boolean;
        slowModeSeconds: number;
        pinnedMessageId: string | null;
    }>;
    getClubRoomMembers(communityId: string): Promise<{
        id: string;
        fullName: string | null;
        avatarUrl: string | null;
        role: string;
        tags: string[];
    }[]>;
    getMemberTags(communityId: string, userId: string): Promise<string[]>;
    saveMessage(senderId: string, data: CreateMessageDto): Promise<{
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
        isRevoked: boolean;
        revokedAt: Date | null;
        senderId: string | null;
        roomId: string;
        messageText: string | null;
        attachmentsUrls: string[];
        metadata: unknown;
        clientMessageId: string | null;
        isRead: boolean;
        revokedBy: string | null;
        replyToId: string | null;
        isPinned: boolean;
        pinnedBy: string | null;
        pinnedAt: Date | null;
    }>;
    getMessagesByRoom(roomId: string, limit?: number): Promise<{
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
    getMessagesPage(roomId: string, limit: number, cursor?: string, userId?: string): Promise<{
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
    findMessageById(messageId: string): Promise<{
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
    revokeMessage(messageId: string, revokedById: string): Promise<{
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
    pinMessage(roomId: string, messageId: string, pinnedById: string): Promise<{
        success: boolean;
        messageId: string;
        pinnedAt: Date;
    }>;
    unpinMessage(roomId: string, messageId: string): Promise<{
        success: boolean;
        messageId: string;
    }>;
    getPinnedMessage(roomId: string): Promise<{
        id: string;
        roomId: string;
        messageText: string | null;
        attachmentsUrls: string[];
        createdAt: Date;
        senderName: string;
        senderAvatar: string | null;
    } | null>;
    toggleReaction(messageId: string, userId: string, emoji: string): Promise<string[]>;
    updateClubRoomSettings(roomId: string, data: {
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
    getCommunityRole(communityId: string, userId: string): Promise<"MEMBER" | "MODERATOR" | "ADMIN" | "OWNER" | null>;
    countUnreadForUser(roomId: string, userId: string, lastReadAt?: Date | null): Promise<number>;
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
    getReadState(roomId: string, userId: string): Promise<{
        id: string;
        roomId: string;
        userId: string;
        lastReadAt: Date;
    }>;
    markRead(roomId: string, userId: string): Promise<{
        id: string;
        userId: string;
        roomId: string;
        lastReadAt: Date;
    }>;
    countUnreadUsingState(roomId: string, userId: string): Promise<number>;
    findSupportRoomForUser(userId: string): Promise<{
        id: string;
        name: string | null;
        type: string;
        createdAt: Date;
    }>;
    findRoomById(roomId: string): Promise<{
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
    getSupportRooms(): Promise<{
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
    markSupportRoomRead(roomId: string): Promise<void>;
    getLastUserMessageInRoom(roomId: string, userId: string): Promise<{
        createdAt: Date;
    }>;
    getCommunityMemberUserIds(communityId: string, excludeUserId?: string): Promise<string[]>;
    findUserById(userId: string): Promise<{
        id: string;
        fullName: string | null;
    }>;
    getMemberClearedAt(roomId: string, userId: string): Promise<Date | null>;
    clearRoomHistory(userId: string, roomId: string): Promise<boolean>;
    getCommunityMembersWithNotificationPref(communityId: string, excludeUserId?: string): Promise<{
        userId: string;
        notificationPreference: string;
    }[]>;
}
