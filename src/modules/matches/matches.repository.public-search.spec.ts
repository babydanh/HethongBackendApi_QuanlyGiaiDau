import { MatchesRepository } from './matches.repository';
import type { AppDb } from '../../database/db.types';

type QueryBuilder = {
  from: (...args: unknown[]) => QueryBuilder;
  where: (...args: unknown[]) => QueryBuilder;
  orderBy: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  leftJoin: (...args: unknown[]) => QueryBuilder;
  $dynamic: () => QueryBuilder;
  then: (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

describe('MatchesRepository public search projection', () => {
  it('includes tournament name for matches without a group', async () => {
    const selectResults: unknown[][] = [
      [{ count: 1 }],
      [
        {
          id: 'match-1',
          tournamentId: 'tournament-1',
          participant1Id: null,
          participant2Id: null,
          groupId: null,
          stageId: null,
          status: 'SCHEDULED',
          updatedAt: new Date('2026-09-27T00:00:00.000Z'),
        },
      ],
      [
        {
          tournamentId: 'tournament-1',
          tournamentName: 'No Group Cup',
          venueName: null,
          venueAddress: null,
        },
      ],
    ];
    let queryIndex = 0;
    const db = {
      select: () => {
        const result = selectResults[queryIndex++];
        const builder: QueryBuilder = {
          from: () => builder,
          where: () => builder,
          orderBy: () => builder,
          limit: () => builder,
          leftJoin: () => builder,
          $dynamic: () => builder,
          then: (resolve, reject) =>
            Promise.resolve(result).then(resolve, reject),
        };
        return builder;
      },
    };
    const repository = new MatchesRepository(
      db as unknown as AppDb,
      {} as never,
    );

    const page = await repository.findAll({ limit: 10 });

    expect(page.data).toHaveLength(1);
    expect(page.data[0].tournament.name).toBe('No Group Cup');
  });
});
