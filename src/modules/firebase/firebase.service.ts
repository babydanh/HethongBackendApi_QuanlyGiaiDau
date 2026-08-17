import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { AppDb } from '../../database/db.types';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { eq, and, inArray } from 'drizzle-orm';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firebaseAdmin: any = null;
  private firebaseApp: any = null;
  private isInitialized = false;

  constructor(
    private readonly configService: ConfigService,
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  onModuleInit() {
    try {
      // Safely require firebase-admin to prevent container crash if missing
      this.firebaseAdmin = require('firebase-admin');
    } catch {
      this.logger.warn('[FirebaseService] firebase-admin package is not installed. Push notifications will be disabled.');
      return;
    }
    this.initFirebase();
  }

  private initFirebase() {
    if (!this.firebaseAdmin) return;

    if (this.firebaseAdmin.apps?.length > 0) {
      this.firebaseApp = this.firebaseAdmin.apps[0];
      this.isInitialized = true;
      return;
    }

    try {
      let serviceAccount: any = null;

      // 1. Check Base64 encoded environment variable (useful for Docker/CI/VPS)
      const base64Key = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_BASE64');
      if (base64Key) {
        const decoded = Buffer.from(base64Key, 'base64').toString('utf8');
        serviceAccount = JSON.parse(decoded);
      }

      // 2. Check JSON file on disk
      if (!serviceAccount) {
        const customPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
        const candidatePaths = [
          customPath ? path.resolve(process.cwd(), customPath) : null,
          path.resolve(process.cwd(), 'secrets', 'firebase-service-account.json'),
          path.resolve(process.cwd(), 'firebase-service-account.json'),
        ].filter(Boolean) as string[];

        for (const filePath of candidatePaths) {
          if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            serviceAccount = JSON.parse(raw);
            this.logger.log(`Found Firebase service account file at: ${filePath}`);
            break;
          }
        }
      }

      if (serviceAccount && serviceAccount.project_id && serviceAccount.private_key) {
        this.firebaseApp = this.firebaseAdmin.initializeApp({
          credential: this.firebaseAdmin.credential.cert(serviceAccount),
        });
        this.isInitialized = true;
        this.logger.log(`[FirebaseService] Firebase Admin SDK initialized successfully for project: ${serviceAccount.project_id}`);
      } else {
        this.logger.warn('[FirebaseService] No valid Firebase service account found. Push notifications will be skipped.');
      }
    } catch (error: any) {
      this.logger.error(`[FirebaseService] Failed to initialize Firebase Admin SDK: ${error?.message || error}`);
    }
  }

  /**
   * Save or update an FCM device token for a user
   */
  async registerDeviceToken(
    userId: string,
    token: string,
    platform: 'ANDROID' | 'IOS' | 'WEB' = 'ANDROID',
    deviceInfo?: string,
  ) {
    if (!token || !userId) return null;

    const [existing] = await this.db
      .select()
      .from(schema.userDeviceTokens)
      .where(
        and(
          eq(schema.userDeviceTokens.userId, userId),
          eq(schema.userDeviceTokens.token, token),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(schema.userDeviceTokens)
        .set({
          platform,
          deviceInfo: deviceInfo ?? existing.deviceInfo,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.userDeviceTokens.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(schema.userDeviceTokens)
      .values({
        userId,
        token,
        platform,
        deviceInfo: deviceInfo ?? null,
        isActive: true,
      })
      .returning();

    return created;
  }

  /**
   * Remove/deactivate a device token when user logs out
   */
  async removeDeviceToken(userId: string, token: string) {
    if (!token || !userId) return;

    await this.db
      .delete(schema.userDeviceTokens)
      .where(
        and(
          eq(schema.userDeviceTokens.userId, userId),
          eq(schema.userDeviceTokens.token, token),
        ),
      );
  }

  /**
   * Send a push notification to a single user (across all their registered active devices)
   */
  async sendPushToUser(userId: string, payload: PushNotificationPayload) {
    return this.sendPushToUsers([userId], payload);
  }

  /**
   * Send a push notification to multiple users
   */
  async sendPushToUsers(userIds: string[], payload: PushNotificationPayload) {
    if (!this.isInitialized || !this.firebaseApp || !this.firebaseAdmin || userIds.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    try {
      const activeDevices = await this.db
        .select({
          id: schema.userDeviceTokens.id,
          token: schema.userDeviceTokens.token,
          userId: schema.userDeviceTokens.userId,
        })
        .from(schema.userDeviceTokens)
        .where(
          and(
            inArray(schema.userDeviceTokens.userId, userIds),
            eq(schema.userDeviceTokens.isActive, true),
          ),
        );

      if (activeDevices.length === 0) {
        return { successCount: 0, failureCount: 0 };
      }

      const tokens = Array.from(new Set(activeDevices.map((d) => d.token)));

      // Sanitize data values so all fields are strings (FCM requires string key-value pairs)
      const sanitizedData: Record<string, string> = {};
      if (payload.data) {
        for (const [k, v] of Object.entries(payload.data)) {
          if (v !== undefined && v !== null) {
            sanitizedData[k] = typeof v === 'string' ? v : JSON.stringify(v);
          }
        }
      }

      const multicastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: sanitizedData,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'sporto_high_importance_channel',
            priority: 'max',
            defaultVibrateTimings: true,
            defaultSound: true,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await this.firebaseAdmin.messaging().sendEachForMulticast(multicastMessage);

      // Clean up invalid or expired tokens
      const expiredTokenIds: string[] = [];
      response.responses.forEach((res: any, idx: number) => {
        if (!res.success && res.error) {
          const errCode = res.error.code;
          if (
            errCode === 'messaging/registration-token-not-registered' ||
            errCode === 'messaging/invalid-registration-token'
          ) {
            const badToken = tokens[idx];
            const match = activeDevices.find((d) => d.token === badToken);
            if (match) {
              expiredTokenIds.push(match.id);
            }
          }
        }
      });

      if (expiredTokenIds.length > 0) {
        await this.db
          .delete(schema.userDeviceTokens)
          .where(inArray(schema.userDeviceTokens.id, expiredTokenIds));
        this.logger.log(`[FirebaseService] Cleaned up ${expiredTokenIds.length} expired FCM tokens`);
      }

      this.logger.log(
        `[FirebaseService] Push sent to ${tokens.length} devices: ${response.successCount} success, ${response.failureCount} failure`,
      );

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (err: any) {
      this.logger.error(`[FirebaseService] Error sending multicast push: ${err?.message || err}`);
      return { successCount: 0, failureCount: 0 };
    }
  }
}
