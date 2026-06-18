import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, desc } from 'drizzle-orm';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async createNotification(data: CreateNotificationDto) {
    const [record] = await this.db
      .insert(schema.notifications)
      .values({
        receiverId: data.receiverId,
        senderId: data.senderId,
        type: data.type,
        title: data.title,
        content: data.content,
        redirectUrl: data.redirectUrl,
      })
      .returning();
    return record;
  }

  async getNotificationsByUser(userId: string, limit: number = 20) {
    return this.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.receiverId, userId))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit);
  }

  async markAsRead(id: string) {
    const [updated] = await this.db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.id, id))
      .returning();
    return updated;
  }

  async markAllAsRead(userId: string) {
    return this.db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.receiverId, userId))
      .returning();
  }
}


