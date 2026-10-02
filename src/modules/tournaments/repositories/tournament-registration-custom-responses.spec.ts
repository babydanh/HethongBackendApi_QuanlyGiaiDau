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

function createRepository() {
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
          ? [tournament]
          : key === 'tournamentDivisions'
            ? [division]
            : key === 'tournamentDivisions+tournaments'
              ? [owner]
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
