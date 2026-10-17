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

function createRepository({
  matchType = 'DOUBLES',
  registrationMode = 'APPROVAL',
  entryFee = 150000,
}: {
  matchType?: string;
  registrationMode?: string;
  entryFee?: number;
} = {}) {
  const insertedParticipants: Row[] = [];
  const tournamentRow: Row = {
    id: 'tournament-1',
    categoryId: 'category-1',
    matchType,
    tournamentConfig: {
      doublesPairingMode: 'ORGANIZER',
      registrationMode,
      isLite: true,
      mode: 'LITE',
    },
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
    matchType,
    genderRestriction: null,
    status: 'ACTIVE',
    registrationEndDate: null,
    isRegistrationLocked: false,
    maxParticipants: 4,
  };
  const owner = {
    id: 'division-1',
    tournamentId: 'tournament-1',
    matchType,
    maxParticipants: 4,
    tournamentConfig: tournamentRow.tournamentConfig,
  };

  const select = () => {
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
  const paymentRepository = {
    resolveDivisionEntryFee: jest.fn().mockResolvedValue(entryFee),
  };
  const repository = new TournamentRegistrationRepository(
    db as never,
    auditService as never,
    paymentRepository as never,
  );

  return { repository, insertedParticipants };
}

describe('registration organizer-added fee and status', () => {
  it('TC-BTCPAIR-01b: organizer-added doubles club member with one athlete is fee-settled and PENDING_PARTNER', async () => {
    const { repository, insertedParticipants } = createRepository();

    await repository.registerParticipant(
      'tournament-1',
      'member-1',
      { divisionId: 'division-1', teamName: 'Nguyen Thi B' },
      undefined,
      { organizerAdded: true },
    );

    expect(insertedParticipants).toHaveLength(1);
    expect(insertedParticipants[0]).toMatchObject({
      isPaid: true,
      organizerWaivedFee: true,
      teamStatus: 'PENDING_PARTNER',
    });
  });

  it('TC-BTCPAIR-01b: organizer-added singles club member is fee-settled and COMPLETE', async () => {
    const { repository, insertedParticipants } = createRepository({
      matchType: 'SINGLES',
    });

    await repository.registerParticipant(
      'tournament-1',
      'member-1',
      { divisionId: 'division-1', teamName: 'Nguyen Thi B' },
      undefined,
      { organizerAdded: true },
    );

    expect(insertedParticipants[0]).toMatchObject({
      isPaid: true,
      organizerWaivedFee: true,
      teamStatus: 'COMPLETE',
    });
  });

  it('TC-BTCPAIR-01b guard: self-registration in a paid approval tournament stays unpaid and PENDING_APPROVAL', async () => {
    const { repository, insertedParticipants } = createRepository();

    await repository.registerParticipant('tournament-1', 'member-1', {
      divisionId: 'division-1',
      teamName: 'Nguyen Thi B',
    });

    expect(insertedParticipants[0]).toMatchObject({
      isPaid: false,
      organizerWaivedFee: false,
      teamStatus: 'PENDING_APPROVAL',
    });
  });
});
