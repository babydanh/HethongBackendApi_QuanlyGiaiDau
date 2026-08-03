import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNotNull, like, lt, not, or, type SQL } from 'drizzle-orm';
import type { AppDb } from '../../database/db.types';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { CursorPaginationHelper } from '../../common/helpers/cursor-pagination.helper';

const MANAGEMENT_NOTIFICATION_TYPES = [
  'TOURNAMENT_PARTICIPANT_NEW',
  'TOURNAMENT_TEAM_COMPLETED',
  'TOURNAMENT_WITHDRAWN',
  'TOURNAMENT_PUBLISH_APPROVED',
  'TOURNAMENT_PUBLISH_REJECTED',
  'TOURNAMENT_SUSPENDED',
  'TOURNAMENT_UNSUSPENDED',
  'TOURNAMENT_DELETE_APPROVED',
  'TOURNAMENT_DELETE_REJECTED',
  'STAFF_ADDED',
  'REFEREE_INVITE_ACCEPTED',
  'REFEREE_INVITE_DECLINED',
  'PAYOUT_APPROVED',
  'PAYOUT_REJECTED',
] as const;

const managementScopeCondition = (): SQL =>
  or(
    inArray(schema.notifications.type, MANAGEMENT_NOTIFICATION_TYPES as unknown as string[]),
    and(
      eq(schema.notifications.type, 'TOURNAMENT_PAYMENT_COMPLETED'),
      isNotNull(schema.notifications.redirectUrl),
      like(schema.notifications.redirectUrl, '/organizer/%'),
    ),
  ) as SQL;

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
    const { page = 1, limit = 10, cursor, isRead, scope = 'player' } = query;
    const conditions: SQL[] = [eq(schema.notifications.receiverId, userId)];
    conditions.push(scope === 'management' ? managementScopeCondition() : not(managementScopeCondition()));

    if (isRead !== undefined) {
      conditions.push(eq(schema.notifications.isRead, isRead));
    }

    const baseWhereClause = and(...conditions);
    const decodedCursor = cursor
      ? CursorPaginationHelper.decodeCursor<{ id: string; createdAt: string }>(cursor)
      : null;
    if (decodedCursor) {
      conditions.push(
        or(
          lt(schema.notifications.createdAt, new Date(decodedCursor.createdAt)),
          and(
            eq(schema.notifications.createdAt, new Date(decodedCursor.createdAt)),
            lt(schema.notifications.id, decodedCursor.id),
          ),
        ) as SQL,
      );
    }
    const whereClause = and(...conditions);

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.notifications)
      .where(baseWhereClause);

    const notificationsQuery = this.db
      .select()
      .from(schema.notifications)
      .where(whereClause)
      .orderBy(desc(schema.notifications.createdAt), desc(schema.notifications.id))
      .limit(limit + 1)
      .$dynamic();
    const rawData = await notificationsQuery;
    const hasMore = rawData.length > limit;
    const data = hasMore ? rawData.slice(0, limit) : rawData;

    return {
      data,
      meta: {
        total: totalRecord.count,
        page,
        limit,
        totalPages: Math.ceil(totalRecord.count / limit),
        nextCursor: hasMore && data.length > 0
          ? CursorPaginationHelper.encodeCursor({ id: data[data.length - 1].id, createdAt: data[data.length - 1].createdAt })
          : null,
        hasMore,
      },
    };
  }

  async getUnreadCountByUser(userId: string, scope: 'player' | 'management' = 'player') {
    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.receiverId, userId),
          eq(schema.notifications.isRead, false),
          scope === 'management' ? managementScopeCondition() : not(managementScopeCondition()),
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

  async markAllAsRead(userId: string, scope: 'player' | 'management' = 'player') {
    return this.db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(schema.notifications.receiverId, userId),
          eq(schema.notifications.isRead, false),
          scope === 'management' ? managementScopeCondition() : not(managementScopeCondition()),
        ),
      )
      .returning();
  }

  async deleteByReceiverTypeAndRedirect(
    receiverId: string,
    type: string,
    redirectUrl: string,
  ) {
    return this.db
      .delete(schema.notifications)
      .where(
        and(
          eq(schema.notifications.receiverId, receiverId),
          eq(schema.notifications.type, type),
          eq(schema.notifications.redirectUrl, redirectUrl),
        ),
      )
      .returning();
  }
}
