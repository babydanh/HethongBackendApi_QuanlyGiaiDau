import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppDb } from '../../database/db.types';
export interface PushNotificationPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
    imageUrl?: string;
}
export declare class FirebaseService implements OnModuleInit {
    private readonly configService;
    private readonly db;
    private readonly logger;
    private firebaseApp;
    private isInitialized;
    constructor(configService: ConfigService, db: AppDb);
    onModuleInit(): void;
    private initFirebase;
    registerDeviceToken(userId: string, token: string, platform?: 'ANDROID' | 'IOS' | 'WEB', deviceInfo?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        isActive: boolean;
        token: string;
        platform: string;
        deviceInfo: string | null;
    } | null>;
    removeDeviceToken(userId: string, token: string): Promise<void>;
    sendPushToUser(userId: string, payload: PushNotificationPayload): Promise<{
        successCount: number;
        failureCount: number;
    }>;
    sendPushToUsers(userIds: string[], payload: PushNotificationPayload): Promise<{
        successCount: number;
        failureCount: number;
    }>;
}
