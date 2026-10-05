import * as schema from '../../../database/schema';
import { TournamentRegistrationRepository } from './tournament-registration.repository';

type Row = Record<string, unknown>;

const tableNames = new Map<unknown, string>([
  [schema.tournaments, 'tournaments'],
  [schema.tournamentDivisions, 'tournamentDivisions'],
  [schema.seriesEvents, 'seriesEvents'],
  [schema.seriesLegs, 'seriesLegs'],
  [schema.tournamentSeries, 'tournamentSeries'],
  [schema.seriesStandings, 'seriesStandings'],
  [schema.tournamentParticipants, 'tournamentParticipants'],
  [schema.tournamentRosters, 'tournamentRosters'],
  [schema.users, 'users'],
  [schema.profiles, 'profiles'],
]);

const tournament: Row = {
  id: 'tournament-1',
  categoryId: 'category-1',
  matchType: 'DOUBLES',
  tournamentConfig: { doublesPairingMode: 'ORGANIZER' },
  status: 'REGISTRATION_OPEN',
  visibility: 'PUBLIC',
  registrationEndDate: null,
  isRegistrationLocked: false,
  isRanked: false,
  maxParticipants: 4,
};

const division: Row = {
  id: 'division-1',
  tournamentId: 'tournament-1',
  matchType: 'DOUBLES',
  genderRestriction: 'OPEN',
  status: 'ACTIVE',
  registrationEndDate: null,
  isRegistrationLocked: false,
  maxParticipants: 4,
};

function createRepository(
  divisions: Row[] = [division],
  tournamentRow: Row = tournament,
) {
  const insertedParticipants: Row[] = [];
  const owner = {
    id: 'division-1',
    tournamentId: 'tournament-1',
    matchType: 'DOUBLES',
    maxParticipants: 4,
    tournamentConfig: tournament.tournamentConfig,
  };

  const select = (fields?: Record<string, unknown>) => {
    const tables: string[] = [];
    const query: Record<string, (...args: unknown[]) => unknown> = {};
    const recordTable = (table: unknown) => {
      const name = tableNames.get(table);
      if (name) tables.push(name);
      return query;
    };

    query.from = recordTable;
    query.innerJoin = recordTable;
    query.leftJoin = recordTable;
    query.where = () => query;
    query.groupBy = () => query;
    query.orderBy = () => query;
    query.limit = () => query;
    query.for = () => query;
    query.then = (
      resolve: (value: Row[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      const key = [...new Set(tables)].sort().join('+');
      const result: Row[] =
        key === 'tournaments'
          ? [tournamentRow]
          : key === 'tournamentDivisions'
            ? divisions
            : key === 'tournamentDivisions+tournaments'
              ? [owner]
            : key === 'profiles+users'
              ? [{ id: 'partner-1' }]
              : [];
      return Promise.resolve(result).then(resolve, reject);
    };

    return query;
  };

  const tx = {
    select,
    insert: (table: unknown) => ({
      values: (values: Row) => {
        if (table !== schema.tournamentParticipants) return Promise.resolve();
        insertedParticipants.push(values);
        return {
          returning: async () => [{ id: 'participant-1', ...values }],
        };
      },
    }),
  };

  const db = {
    transaction: async (callback: (transaction: unknown) => unknown) =>
      callback(tx),
  };
  const auditService = { logCreate: jest.fn() };
  const paymentRepository = { resolveDivisionEntryFee: jest.fn().mockResolvedValue(0) };
  const repository = new TournamentRegistrationRepository(
    db as never,
    auditService as never,
    paymentRepository as never,
  );

  return { repository, insertedParticipants };
}

describe('registration custom responses', () => {
  it('does not persist the importer marker from an untrusted registration payload', async () => {
    const { repository, insertedParticipants } = createRepository();

    await repository.registerParticipant('tournament-1', 'user-1', {
      divisionId: 'division-1',
      teamName: 'Player One',
      customResponses: {
        shirtSize: 'L',
        importedFrom: 'GOOGLE_FORM',
        player2Name: 'Spoofed Partner',
      },
    });

    expect(insertedParticipants[0].customResponses).toEqual({
      shirtSize: 'L',
      player2Name: 'Spoofed Partner',
    });
  });
});
describe('division selection without an id', () => {
  it('falls back to the only open division without requiring profile gender', async () => {
    const { repository, insertedParticipants } = createRepository([
      { ...division, genderRestriction: null },
    ]);

    await repository.registerParticipant('tournament-1', 'user-1', {
      teamName: 'Player One',
    });

    expect(insertedParticipants[0].tournamentDivisionId).toBe('division-1');
  });

  it('rejects multiple divisions instead of inferring a gender category', async () => {
    const { repository, insertedParticipants } = createRepository([
      division,
      { ...division, id: 'division-2' },
    ]);

    await expect(
      repository.registerParticipant('tournament-1', 'user-1', {
        teamName: 'Player One',
      }),
    ).rejects.toThrow('Vui lòng chọn nội dung');

    expect(insertedParticipants).toHaveLength(0);
  });
  it('rejects ambiguous ID-less registration when a partner invite is included', async () => {
    const { repository } = createRepository(
      [division, { ...division, id: 'division-2' }],
      { ...tournament, genderRestriction: 'MALE' },
    );

    await expect(
      repository.registerParticipant('tournament-1', 'user-1', {
        teamName: 'Player One',
        partnerEmailOrPhone: 'partner@example.com',
      }),
    ).rejects.toThrow('Vui lòng chọn nội dung');

  });
  it('does not require partner profile gender for open doubles', async () => {
    const { repository, insertedParticipants } =
      createRepository(
        [{ ...division, genderRestriction: 'OPEN' }],
        {
          ...tournament,
          tournamentConfig: { doublesPairingMode: 'SELF' },
        },
      );

    await repository.registerParticipant('tournament-1', 'user-1', {
      divisionId: 'division-1',
      teamName: 'Player One',
      partnerEmailOrPhone: 'partner@example.com',
    });

    expect(insertedParticipants[0].tournamentDivisionId).toBe('division-1');
  });
});
