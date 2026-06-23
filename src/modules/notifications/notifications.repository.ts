import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import type { AppDb } from '../../database/db.types';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';

@Injectable()
export class NotificationsRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

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

  async getNotificationsByUser(userId: string, query: QueryNotificationsDto) {
    const { page = 1, limit = 10, isRead } = query;
    const offset = (page - 1) * limit;
    const conditions: SQL[] = [eq(schema.notifications.receiverId, userId)];

    if (isRead !== undefined) {
      conditions.push(eq(schema.notifications.isRead, isRead));
    }

    const whereClause = and(...conditions);

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.notifications)
      .where(whereClause);

    const data = await this.db
      .select()
      .from(schema.notifications)
      .where(whereClause)
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      data,
      meta: {
        total: totalRecord.count,
        page,
        limit,
        totalPages: Math.ceil(totalRecord.count / limit),
      },
    };
  }

  async getUnreadCountByUser(userId: string) {
    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.receiverId, userId),
          eq(schema.notifications.isRead, false),
        ),
      );

    return totalRecord.count;
  }

  async markAsRead(id: string, userId: string) {
    const [updated] = await this.db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.receiverId, userId),
        ),
      )
      .returning();

    return updated;
  }

  async markAllAsRead(userId: string) {
    return this.db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(schema.notifications.receiverId, userId),
          eq(schema.notifications.isRead, false),
        ),
      )
      .returning();
  }
}
