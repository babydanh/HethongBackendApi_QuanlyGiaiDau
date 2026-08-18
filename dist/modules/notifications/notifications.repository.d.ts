import type { AppDb } from '../../database/db.types';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
export declare class NotificationsRepository {
    private readonly db;
    constructor(db: AppDb);
    createNotification(data: CreateNotificationDto): Promise<{
        id: string;
        createdAt: Date;
        type: string;
        title: string;
        receiverId: string;
        senderId: string | null;
        content: string;
        redirectUrl: string | null;
        isRead: boolean;
    }>;
    getNotificationsByUser(userId: string, query: QueryNotificationsDto): Promise<{
        data: {
            id: string;
            receiverId: string;
            senderId: string | null;
            type: string;
            title: string;
            content: string;
            redirectUrl: string | null;
            isRead: boolean;
            createdAt: Date;
        }[];
        meta: {
            total: number;
            page: number;
            limit: number;
            totalPages: number;
            nextCursor: string | null;
            hasMore: boolean;
        };
    }>;
    getUnreadCountByUser(userId: string): Promise<number>;
    markAsRead(id: string, userId: string): Promise<{
        id: string;
        receiverId: string;
        senderId: string | null;
        type: string;
        title: string;
        content: string;
        redirectUrl: string | null;
        isRead: boolean;
        createdAt: Date;
    }>;
    markAllAsRead(userId: string): Promise<{
        id: string;
        receiverId: string;
        senderId: string | null;
        type: string;
        title: string;
        content: string;
        redirectUrl: string | null;
        isRead: boolean;
        createdAt: Date;
    }[]>;
    deleteByReceiverTypeAndRedirect(receiverId: string, type: string, redirectUrl: string): Promise<{
        id: string;
        createdAt: Date;
        type: string;
        title: string;
        receiverId: string;
        senderId: string | null;
        content: string;
        redirectUrl: string | null;
        isRead: boolean;
    }[]>;
}
