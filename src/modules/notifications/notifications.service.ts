import { Injectable } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async sendNotification(data: CreateNotificationDto) {
    const notification = await this.notificationsRepository.createNotification(data);
    
    // Ép kiểu sang Record<string, unknown> để pass rule
    this.notificationsGateway.pushNotification(
      data.receiverId,
      notification as unknown as Record<string, unknown>,
    );

    return notification;
  }

  async getMyNotifications(userId: string) {
    return this.notificationsRepository.getNotificationsByUser(userId);
  }

  async markAsRead(id: string) {
    return this.notificationsRepository.markAsRead(id);
  }
}
