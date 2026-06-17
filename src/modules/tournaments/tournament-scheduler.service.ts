import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, lte } from 'drizzle-orm';

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
}


