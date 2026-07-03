import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, lte, gte } from 'drizzle-orm';

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
}


