import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { RegisterDeviceTokenDto, RemoveDeviceTokenDto } from './dto/register-device-token.dto';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsRepository } from './notifications.repository';
import { FirebaseService } from '../firebase/firebase.service';
export declare class NotificationsService {
    private readonly notificationsRepository;
    private readonly notificationsGateway;
    private readonly firebaseService;
    private readonly logger;
    constructor(notificationsRepository: NotificationsRepository, notificationsGateway: NotificationsGateway, firebaseService: FirebaseService);
    registerDeviceToken(userId: string, dto: RegisterDeviceTokenDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        isActive: boolean;
        token: string;
        platform: string;
        deviceInfo: string | null;
    } | null>;
    removeDeviceToken(userId: string, dto: RemoveDeviceTokenDto): Promise<void>;
    sendNotification(data: CreateNotificationDto): Promise<{
        id: string;
        createdAt: Date;
        type: string;
        senderId: string | null;
        receiverId: string;
        isRead: boolean;
        title: string;
        content: string;
        redirectUrl: string | null;
    }>;
    getMyNotifications(userId: string, query: QueryNotificationsDto): Promise<{
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
    getUnreadCount(userId: string): Promise<{
        count: number;
    }>;
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
        senderId: string | null;
        receiverId: string;
        isRead: boolean;
        title: string;
        content: string;
        redirectUrl: string | null;
    }[]>;
}
