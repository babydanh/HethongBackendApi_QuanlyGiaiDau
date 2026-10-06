import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { TournamentSchedulerService } from './tournament-scheduler.service';

describe('TournamentSchedulerService registration auto-open', () => {
  it('excludes manually locked tournaments from the scheduled auto-open query', async () => {
    const queryBuilder = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockResolvedValue([]),
    };
    const database = {
      select: jest.fn().mockReturnValue(queryBuilder),
      update: jest.fn(),
    };
    const scheduler = new TournamentSchedulerService(
      database as never,
      null as never,
      { sendDueReminders: jest.fn().mockResolvedValue(0) } as never,
    );

    await scheduler.handleAutoOpenRegistration();

    expect(queryBuilder.where).toHaveBeenCalledTimes(1);
    const predicate = queryBuilder.where.mock.calls[0][0] as SQL;
    const query = new PgDialect().sqlToQuery(predicate);
    expect(query.sql).toContain('"is_registration_locked" =');
    expect(query.params).toContain(false);
    expect(query.sql).toContain('"status" =');
    expect(query.params).toContain('UPCOMING');
    expect(query.sql).toContain('"registration_start_date" <=');
  });
});
