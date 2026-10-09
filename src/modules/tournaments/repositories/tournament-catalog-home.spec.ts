import { drizzle } from 'drizzle-orm/postgres-js';
import type { AppSqlClient } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { TournamentCatalogRepository } from './tournament-catalog.repository';

const tournamentRow = [
  'tournament-1',
  'Public tournament',
  null,
  'banner.png',
  'Pickleball',
  'REGISTRATION_OPEN',
];

function fixture(results: unknown[][][]) {
  // Keep real Drizzle SQL generation and result mapping. Only the driver's
  // network boundary is stubbed, so query-builder mocks cannot hide aliases.
  const unsafe = jest.fn((_query: string, _params: unknown[]) => ({
    values: async () => results.shift() ?? [],
  }));
  const client = {
    options: { parsers: {}, serializers: {} },
    unsafe,
  } as unknown as AppSqlClient;
  const db = drizzle(client, { schema });
  const repository = new TournamentCatalogRepository(
    db,
    {} as never,
    {} as never,
    {} as never,
  );
  return { repository, unsafe };
}

function matchRow(status: 'ONGOING' | 'COMPLETED') {
  return [
    1,
    'tournament-1',
    'match-1',
    'division-1',
    'Mixed doubles',
    'Knockout stage',
    2,
    2,
    1,
    'MAIN',
    null,
    null,
    status,
    '2026-10-08T04:00:00Z',
    '2026-10-08T04:10:00Z',
    status === 'COMPLETED' ? '2026-10-08T04:30:00Z' : null,
    { sets: [{ team1Score: 11, team2Score: 7 }] },
    true,
    'team-1',
    'First team',
    'first.png',
    'team-2',
    'Second team',
    'second.png',
  ];
}

describe('TournamentCatalogRepository home projection', () => {
  it.each(['ONGOING', 'COMPLETED'] as const)(
    'generates unambiguous subquery columns and maps distinct teams for %s',
    async (status) => {
      const tournament = [
        ...tournamentRow.slice(0, 5),
        status === 'COMPLETED' ? 'COMPLETED' : 'REGISTRATION_OPEN',
      ];
      const { repository, unsafe } = fixture([
        [tournament],
        [matchRow(status)],
        [
          ['team-1', 'Player A', null],
          ['team-2', 'Player B', 'avatar.png'],
        ],
      ]);

      const result = await repository.findHomeProjection(undefined, status);

      const query = unsafe.mock.calls[1][0] as string;
      const outerSelect = query.slice(0, query.indexOf(' from (select '));
      const columnNames = [...outerSelect.matchAll(/"([^"]+)"/g)].map(
        (match) => match[1],
      );
      expect(columnNames).toHaveLength(24);
      expect(new Set(columnNames).size).toBe(columnNames.length);
      expect(query).toContain('"matches"."id" as "match_id"');
      expect(query).toContain('"tournament_participants"."id" as "team1_id"');
      expect(query).toContain('"home_final_p2"."id" as "team2_id"');
      expect(query).toContain(
        status === 'ONGOING'
          ? "in ('ONGOING', 'IN_PROGRESS', 'LIVE', 'PLAYING')"
          : "in ('COMPLETED', 'FINISHED', 'DONE', 'ENDED')",
      );
      const tournamentQuery = unsafe.mock.calls[0][0] as string;
      if (status === 'COMPLETED') {
        expect(tournamentQuery).toContain('"tournaments"."status" = $');
        expect(unsafe.mock.calls[0][1]).toContain('COMPLETED');
      }

      expect(result.featuredTournaments[0].registrationStatus).toBe(
        status === 'COMPLETED' ? null : 'OPEN',
      );
      expect(result.featuredTournaments[0].status).toBe(tournament[5]);
      expect(result.tournaments[0].status).toBe(tournament[5]);
      expect(result.tournaments[0].matches[0]).toEqual(
        expect.objectContaining({
          id: 'match-1',
          divisionId: 'division-1',
          divisionName: 'Mixed doubles',
          stageName: 'Knockout stage',
          status,
          lastRoundNumber: 2,
          scheduledAt: new Date('2026-10-08T04:00:00Z'),
          scoreSets: [{ team1: 11, team2: 7 }],
          team1: {
            id: 'team-1',
            name: 'First team',
            logoUrl: 'first.png',
            members: [{ name: 'Player A', avatarUrl: null }],
          },
          team2: {
            id: 'team-2',
            name: 'Second team',
            logoUrl: 'second.png',
            members: [{ name: 'Player B', avatarUrl: 'avatar.png' }],
          },
        }),
      );
    },
  );

  it('returns empty lists without executing the ranked query for an unknown sport', async () => {
    const { repository, unsafe } = fixture([[]]);
    await expect(
      repository.findHomeProjection('__diagnostic_no_match__', 'ONGOING'),
    ).resolves.toEqual({ featuredTournaments: [], tournaments: [] });
    expect(unsafe).toHaveBeenCalledTimes(1);
    expect(unsafe.mock.calls[0][1]).toContain('__diagnostic_no_match__');
  });

  it('preserves nullable division names and hides scores when the scoreboard is disabled', async () => {
    const row = matchRow('ONGOING');
    row[3] = null;
    row[4] = null;
    row[17] = false;
    const { repository } = fixture([[tournamentRow], [row], []]);
    const result = await repository.findHomeProjection('pickleball', 'ONGOING');
    expect(result.tournaments[0].matches[0]).toEqual(
      expect.objectContaining({
        divisionId: null,
        divisionName: null,
        scoreSets: [],
      }),
    );
  });
});
