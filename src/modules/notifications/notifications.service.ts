import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async sendNotification(data: CreateNotificationDto) {
    const notification = await this.notificationsRepository.createNotification(data);

    this.notificationsGateway.pushNotification(data.receiverId, notification);

    return notification;
  }

  async getMyNotifications(userId: string, query: QueryNotificationsDto) {
    return this.notificationsRepository.getNotificationsByUser(userId, query);
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationsRepository.getUnreadCountByUser(userId);
    return { count };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.notificationsRepository.markAsRead(id, userId);

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  async markAllAsRead(userId: string) {
    return this.notificationsRepository.markAllAsRead(userId);
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
