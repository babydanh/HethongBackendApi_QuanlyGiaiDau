import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { TournamentLiteRepository } from './tournament-lite.repository';

function makeRepository() {
  let whereClause: SQL | undefined;
  let selectedCount: SQL | undefined;
  const query: Record<string, unknown> = {};
  query.from = jest.fn(() => query);
  query.innerJoin = jest.fn(() => query);
  query.where = jest.fn((condition: SQL) => {
    whereClause = condition;
    return query;
  });
  query.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve([{ count: 3 }]).then(resolve, reject);

  const db = {
    select: jest.fn((fields: { count: SQL }) => {
      selectedCount = fields.count;
      return query;
    }),
  };
  const repository = new TournamentLiteRepository(
    db as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return {
    repository,
    getWhereClause: () => whereClause,
    getSelectedCount: () => selectedCount,
  };
}

describe('TournamentLiteRepository.countLiteActiveRosterUsers', () => {
  it('keeps distinct users and excludes non-reserving statuses', async () => {
    const { repository, getWhereClause, getSelectedCount } = makeRepository();

    await expect(
      repository.countLiteActiveRosterUsers('tournament-1'),
    ).resolves.toBe(3);

    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(getSelectedCount()!).sql).toMatch(/count\(distinct/i);
    expect(dialect.sqlToQuery(getWhereClause()!).params).toEqual([
      'tournament-1',
      'PENDING',
      'PENDING_APPROVAL',
      'PENDING_PARTNER',
      'COMPLETE',
    ]);
  });
});
