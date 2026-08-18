import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { RegisterDeviceTokenDto, RemoveDeviceTokenDto } from './dto/register-device-token.dto';
import { NotificationsService } from './notifications.service';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
    getMyNotifications(user: JwtPayload, query: QueryNotificationsDto): Promise<{
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
    getUnreadCount(user: JwtPayload): Promise<{
        count: number;
    }>;
    markAsRead(id: string, user: JwtPayload): Promise<{
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
    markAllAsRead(user: JwtPayload): Promise<{
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
    registerDeviceToken(user: JwtPayload, body: RegisterDeviceTokenDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        isActive: boolean;
        token: string;
        platform: string;
        deviceInfo: string | null;
    } | null>;
    removeDeviceToken(user: JwtPayload, body: RemoveDeviceTokenDto): Promise<{
        success: boolean;
    }>;
}
