import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';

const MS_PER_DAY = 86400000;

function nextRecurringDate(
  frequency: string,
  daysOfWeek: number[] | number,
  timeOfDay: string,
  fromDate: Date,
): Date {
  const [hours, minutes] = (timeOfDay || '18:00').split(':').map(Number);
  const target = new Date(fromDate);
  target.setHours(hours, minutes, 0, 0);
  if (frequency === 'DAILY') {
    target.setDate(target.getDate() + 1);
    return target;
  }
  if (frequency === 'MONTHLY') {
    target.setMonth(target.getMonth() + 1);
    return target;
  }
  const days =
    Array.isArray(daysOfWeek) && daysOfWeek.length > 0
      ? daysOfWeek
      : [Array.isArray(daysOfWeek) ? 6 : daysOfWeek];
  const currentDay = fromDate.getDay();
  const isTodayPast = fromDate.getTime() >= target.getTime();
  let minDaysAhead = 999;
  for (const day of days) {
    let diff = (day - currentDay + 7) % 7;
    if (diff === 0 && isTodayPast) diff = frequency === 'BIWEEKLY' ? 14 : 7;
    if (diff > 0 && diff < minDaysAhead) minDaysAhead = diff;
  }
  target.setDate(
    fromDate.getDate() + (minDaysAhead === 999 ? 7 : minDaysAhead),
  );
  target.setHours(hours, minutes, 0, 0);
  return target;
}

function asDate(value: unknown, fallback: Date): Date {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? fallback : date;
}

@Injectable()
export class ClubMatchSessionSchedulerService {
  private readonly logger = new Logger(ClubMatchSessionSchedulerService.name);

  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleRecurringClubMatchSessions() {
    this.logger.log('Running recurring club match sessions cron job...');
    try {
      const now = new Date();
      const dueSessions = await this.db
        .select({ session: schema.clubMatchSessions })
        .from(schema.clubMatchSessions)
        .where(
          and(
            isNull(schema.clubMatchSessions.deletedAt),
            ne(schema.clubMatchSessions.status, 'CANCELLED'),
            sql`${schema.clubMatchSessions.sessionConfig}->'recurring'->>'enabled' = 'true'`,
            sql`NULLIF(${schema.clubMatchSessions.sessionConfig}->'recurring'->>'nextRunAt', '')::timestamptz <= ${now}`,
          ),
        );

      for (const candidate of dueSessions) {
        const generated = await this.db.transaction(async (tx) => {
          const [template] = await tx
            .select()
            .from(schema.clubMatchSessions)
            .where(
              and(
                eq(schema.clubMatchSessions.id, candidate.session.id),
                isNull(schema.clubMatchSessions.deletedAt),
                ne(schema.clubMatchSessions.status, 'CANCELLED'),
                sql`${schema.clubMatchSessions.sessionConfig}->'recurring'->>'enabled' = 'true'`,
                sql`NULLIF(${schema.clubMatchSessions.sessionConfig}->'recurring'->>'nextRunAt', '')::timestamptz <= ${now}`,
              ),
            )
            .for('update')
            .limit(1);
          if (!template) return null;

          const config = (template.sessionConfig as Record<string, any>) || {};
          const recurring = config.recurring || {};
          const eventAt = asDate(
            recurring.nextEventAt || recurring.nextRunAt,
            now,
          );
          const durationMinutes = Math.min(
            720,
            Math.max(30, Number(recurring.durationMinutes) || 60),
          );
          const nextEventAt = nextRecurringDate(
            recurring.frequency || 'WEEKLY',
            recurring.daysOfWeek?.length
              ? recurring.daysOfWeek
              : [recurring.dayOfWeek ?? 6],
            recurring.timeOfDay || '18:00',
            eventAt,
          );
          const nextRunAt = new Date(
            nextEventAt.getTime() -
              Math.max(0, Number(recurring.advanceDays) || 0) * MS_PER_DAY,
          );
          const generatedConfig = {
            ...config,
            recurring: { ...recurring, enabled: false },
          };
          const updatedConfig = {
            ...config,
            recurring: {
              ...recurring,
              enabled: true,
              nextRunAt: nextRunAt.toISOString(),
              nextEventAt: nextEventAt.toISOString(),
              lastGeneratedAt: now.toISOString(),
            },
          };
          const templateName =
            typeof recurring.templateName === 'string' &&
            recurring.templateName.trim()
              ? recurring.templateName.trim()
              : template.name;
          const [created] = await tx
            .insert(schema.clubMatchSessions)
            .values({
              communityId: template.communityId,
              categoryId: template.categoryId,
              createdBy: template.createdBy,
              name: templateName,
              description: template.description,
              status: 'OPEN',
              registrationMode: 'MIXED',
              pairingMode: 'FREE',
              isRanked: template.isRanked,
              maxParticipants: template.maxParticipants,
              sessionConfig: generatedConfig,
              startAt: eventAt,
              endAt: new Date(eventAt.getTime() + durationMinutes * 60000),
              registrationOpenAt: now,
            })
            .returning();

          await tx
            .update(schema.clubMatchSessions)
            .set({
              sessionConfig: updatedConfig,
              updatedAt: now,
              version: sql`${schema.clubMatchSessions.version} + 1`,
            })
            .where(eq(schema.clubMatchSessions.id, template.id));

          const displayName = templateName || 'Buổi giao lưu CLB';
          await tx.insert(schema.communityPosts).values({
            communityId: template.communityId,
            authorId: template.createdBy,
            clubMatchSessionId: created.id,
            type: 'CLUB_SESSION_ANNOUNCEMENT',
            body: `🏸 Buổi giao lưu mới: **${displayName}** đã mở đăng ký.`,
            mediaUrls: [],
            status: 'PUBLISHED',
            idempotencyKey:
              `club-match-session:${template.id}:${eventAt.toISOString()}`.slice(
                0,
                128,
              ),
          });
          return created;
        });

        if (!generated) continue;
        const members = await this.db
          .select({ userId: schema.communityMembers.userId })
          .from(schema.communityMembers)
          .where(
            and(
              eq(schema.communityMembers.communityId, generated.communityId),
              eq(schema.communityMembers.status, 'JOINED'),
            ),
          );
        if (members.length > 0) {
          await this.db.insert(schema.notifications).values(
            members.map(({ userId }) => ({
              receiverId: userId,
              senderId: generated.createdBy,
              type: 'CLUB_MATCH_SESSION_CREATED',
              title: 'Buổi giao lưu CLB mới',
              content:
                'Một buổi giao lưu mới đã được tự động tạo và mở đăng ký.',
              redirectUrl: `/communities/${generated.communityId}/match-sessions/${generated.id}`,
            })),
          );
        }
        this.logger.log(
          `Generated recurring club match session ${generated.id}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Error in recurring club match sessions cron job:',
        message,
      );
    }
  }
}
