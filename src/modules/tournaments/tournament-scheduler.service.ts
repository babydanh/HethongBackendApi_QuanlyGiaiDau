import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, lte, gte, ne, isNull, sql } from 'drizzle-orm';

@Injectable()
export class TournamentSchedulerService {
  private readonly logger = new Logger(TournamentSchedulerService.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleAutoCloseRegistration() {
    this.logger.log('Running auto-close registration cron job...');
    try {
      const now = new Date();
      // Find tournaments that are open but past registration end date
      const expiredTournaments = await this.db
        .select()
        .from(schema.tournaments)
        .where(
          and(
            eq(schema.tournaments.status, 'REGISTRATION_OPEN'),
            lte(schema.tournaments.registrationEndDate, now)
          )
        );

      if (expiredTournaments.length === 0) {
        return;
      }

      this.logger.log(`Found ${expiredTournaments.length} tournament(s) to close registration.`);

      for (const tournament of expiredTournaments) {
        await this.db
          .update(schema.tournaments)
          .set({
            status: 'REGISTRATION_CLOSED',
            updatedAt: new Date(),
          })
          .where(eq(schema.tournaments.id, tournament.id));

        this.logger.log(`Tournament ${tournament.id} ("${tournament.name}") registration auto-closed.`);
      }
    } catch (err) {
      this.logger.error('Error in handleAutoCloseRegistration cron job:', err.message);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleAutoOpenRegistration() {
    this.logger.log('Running auto-open registration cron job...');
    try {
      const now = new Date();
      const openingTournaments = await this.db
        .select()
        .from(schema.tournaments)
        .where(
          and(
            eq(schema.tournaments.status, 'UPCOMING'),
            lte(schema.tournaments.registrationStartDate, now)
          )
        );

      if (openingTournaments.length === 0) return;

      this.logger.log(`Found ${openingTournaments.length} tournament(s) to open registration.`);

      for (const tournament of openingTournaments) {
        await this.db
          .update(schema.tournaments)
          .set({
            status: 'REGISTRATION_OPEN',
            updatedAt: now,
          })
          .where(eq(schema.tournaments.id, tournament.id));

        // Gửi thông báo cho người theo dõi
        const followers = await this.db
          .select({ userId: schema.tournamentFollows.userId })
          .from(schema.tournamentFollows)
          .where(eq(schema.tournamentFollows.tournamentId, tournament.id));

        if (followers.length > 0) {
          const notiData = followers.map(f => ({
            receiverId: f.userId,
            type: 'TOURNAMENT_REGISTRATION_OPEN',
            title: `${tournament.name} đã mở đăng ký`,
            content: `Giải đấu "${tournament.name}" đã mở đăng ký tham gia.`,
            redirectUrl: `/tournaments/${tournament.id}`,
          }));
          await this.db.insert(schema.notifications).values(notiData);
          this.logger.log(`Sent ${notiData.length} notifications to followers of ${tournament.id}`);
        }

        this.logger.log(`Tournament ${tournament.id} ("${tournament.name}") registration auto-opened.`);
      }
    } catch (err) {
      this.logger.error('Error in handleAutoOpenRegistration cron job:', err.message);
    }
  }

  calculateNextRecurringDate(frequency: string, dayOfWeek: number, timeOfDay: string, fromDate = new Date()): Date {
    const [hours, minutes] = (timeOfDay || '18:00').split(':').map(Number);
    const target = new Date(fromDate);
    target.setHours(hours, minutes, 0, 0);

    if (frequency === 'DAILY') {
      target.setDate(target.getDate() + 1);
    } else if (frequency === 'WEEKLY') {
      let daysAhead = (dayOfWeek - target.getDay() + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      target.setDate(target.getDate() + daysAhead);
    } else if (frequency === 'BIWEEKLY') {
      let daysAhead = (dayOfWeek - target.getDay() + 7) % 7;
      if (daysAhead === 0) daysAhead = 14;
      else daysAhead += 7;
      target.setDate(target.getDate() + daysAhead);
    } else if (frequency === 'MONTHLY') {
      target.setMonth(target.getMonth() + 1);
    } else {
      target.setDate(target.getDate() + 7);
    }
    return target;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleRecurringLiteTournaments() {
    this.logger.log('Running recurring lite tournaments cron job...');
    try {
      const now = new Date();
      const recurringTournaments = await this.db
        .select()
        .from(schema.tournaments)
        .where(
          and(
            eq(schema.tournaments.tournamentType, 'CLUB'),
            isNull(schema.tournaments.deletedAt),
            ne(schema.tournaments.status, 'CANCELLED'),
            sql`(${schema.tournaments.tournamentConfig}->'recurring'->>'enabled')::boolean = true`,
            sql`(${schema.tournaments.tournamentConfig}->'recurring'->>'nextRunAt')::timestamptz <= ${now}`
          )
        );

      if (recurringTournaments.length === 0) return;

      this.logger.log(`Found ${recurringTournaments.length} recurring lite tournament template(s) to generate.`);

      for (const t of recurringTournaments) {
        const config = (t.tournamentConfig as Record<string, any>) || {};
        const rec = config.recurring || {};
        const frequency = rec.frequency || 'WEEKLY';
        const dayOfWeek = rec.dayOfWeek ?? 6;
        const timeOfDay = rec.timeOfDay || '18:00';

        const nextTournamentDate = new Date(rec.nextRunAt || now);
        const dateStr = nextTournamentDate.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });
        const newName = `${rec.templateName || t.name} (${dateStr})`;

        const [hours, minutes] = timeOfDay.split(':').map(Number);
        nextTournamentDate.setHours(hours, minutes, 0, 0);

        const newTournamentConfig = {
          ...config,
          recurring: {
            ...rec,
            enabled: false,
          },
        };

        const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const newTournament = await this.db
          .insert(schema.tournaments)
          .values({
            name: newName,
            tournamentType: 'CLUB',
            visibility: t.visibility,
            communityId: t.communityId,
            categoryId: t.categoryId,
            matchType: t.matchType,
            description: t.description,
            maxParticipants: t.maxParticipants,
            entryFee: t.entryFee,
            isRanked: t.isRanked,
            sportRules: t.sportRules,
            tournamentConfig: newTournamentConfig,
            startDate: nextTournamentDate,
            registrationStartDate: now,
            registrationEndDate: new Date(nextTournamentDate.getTime() - 60 * 60 * 1000),
            status: 'REGISTRATION_OPEN',
            inviteCode,
            createdBy: t.createdBy,
          })
          .returning();

        const nextNextRun = this.calculateNextRecurringDate(frequency, dayOfWeek, timeOfDay, nextTournamentDate);
        const updatedConfig = {
          ...config,
          recurring: {
            ...rec,
            lastGeneratedAt: now.toISOString(),
            nextRunAt: nextNextRun.toISOString(),
          },
        };

        await this.db
          .update(schema.tournaments)
          .set({
            tournamentConfig: updatedConfig,
            updatedAt: now,
          })
          .where(eq(schema.tournaments.id, t.id));

        if (t.communityId) {
          const members = await this.db
            .select({ userId: schema.communityMembers.userId })
            .from(schema.communityMembers)
            .where(
              and(
                eq(schema.communityMembers.communityId, t.communityId),
                eq(schema.communityMembers.status, 'JOINED')
              )
            );

          if (members.length > 0) {
            const notiData = members.map((m) => ({
              receiverId: m.userId,
              type: 'TOURNAMENT_REGISTRATION_OPEN',
              title: `🏆 Giải đấu định kỳ mới: ${newName}`,
              content: `Giải đấu định kỳ "${newName}" của câu lạc bộ đã được tự động tạo và mở đăng ký!`,
              redirectUrl: `/tournaments/${newTournament[0].id}`,
            }));
            await this.db.insert(schema.notifications).values(notiData);
          }

          // Auto-post to Community Feed
          try {
            await this.db.insert(schema.communityPosts).values({
              communityId: t.communityId,
              authorId: t.createdBy,
              tournamentId: newTournament[0].id,
              type: 'TOURNAMENT_ANNOUNCEMENT',
              body: `🏆 CLB vừa tự động mở giải đấu định kỳ tuần này: **${newName}**! Các thành viên hãy nhanh tay đăng ký tham gia ngay.`,
              mediaUrls: newTournament[0].bannerUrl ? [newTournament[0].bannerUrl] : [],
              status: 'PUBLISHED',
            });
          } catch (feedErr) {
            this.logger.error('Failed to post recurring tournament to community feed:', feedErr.message);
          }
        }

        this.logger.log(`Generated recurring tournament "${newName}" (ID: ${newTournament[0]?.id})`);
      }
    } catch (err) {
      this.logger.error('Error in handleRecurringLiteTournaments cron job:', err.message);
    }
  }
}
