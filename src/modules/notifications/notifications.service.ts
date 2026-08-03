import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { RegisterDeviceTokenDto, RemoveDeviceTokenDto } from './dto/register-device-token.dto';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsRepository } from './notifications.repository';
import { FirebaseService } from '../firebase/firebase.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly firebaseService: FirebaseService,
  ) {}

  async registerDeviceToken(userId: string, dto: RegisterDeviceTokenDto) {
    return this.firebaseService.registerDeviceToken(
      userId,
      dto.token,
      dto.platform || 'ANDROID',
      dto.deviceInfo,
    );
  }

  async removeDeviceToken(userId: string, dto: RemoveDeviceTokenDto) {
    return this.firebaseService.removeDeviceToken(userId, dto.token);
  }

  async sendNotification(data: CreateNotificationDto) {
    const notification = await this.notificationsRepository.createNotification(data);

    // 1. Socket.IO (In-app real-time notification)
    this.notificationsGateway.pushNotification(data.receiverId, notification);

    // 2. Firebase Cloud Messaging (OS Push Notification to lockscreen / system tray)
    try {
      await this.firebaseService.sendPushToUser(data.receiverId, {
        title: data.title,
        body: data.content,
        data: {
          notificationId: notification.id,
          type: data.type,
          redirectUrl: data.redirectUrl || '',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch FCM push for notification ${notification.id}: ${err?.message || err}`);
    }

    return notification;
  }

  async getMyNotifications(userId: string, query: QueryNotificationsDto) {
    return this.notificationsRepository.getNotificationsByUser(userId, query);
  }

  async getUnreadCount(userId: string, scope: 'player' | 'management' = 'player') {
    const count = await this.notificationsRepository.getUnreadCountByUser(userId, scope);
    return { count };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.notificationsRepository.markAsRead(id, userId);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  async markAllAsRead(userId: string, scope: 'player' | 'management' = 'player') {
    return this.notificationsRepository.markAllAsRead(userId, scope);
  }

  async deleteByReceiverTypeAndRedirect(
    receiverId: string,
    type: string,
    redirectUrl: string,
  ) {
    return this.notificationsRepository.deleteByReceiverTypeAndRedirect(
      receiverId,
      type,
      redirectUrl,
    );
  }
}
