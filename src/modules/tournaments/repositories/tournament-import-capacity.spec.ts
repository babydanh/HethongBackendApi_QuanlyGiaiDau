import { BadRequestException } from '@nestjs/common';
import * as schema from '../../../database/schema';
import { TournamentImportRepository } from './tournament-import.repository';

// Drizzle tables are object keys, so the lookup must be by identity.
const TABLE_KEYS = new Map<unknown, string>([
  [schema.tournaments, 'tournaments'],
  [schema.tournamentDivisions, 'divisions'],
  [schema.tournamentParticipants, 'participants'],
  [schema.tournamentRosters, 'rosters'],
  [schema.profiles, 'profiles'],
  [schema.users, 'users'],
]);

type Row = Record<string, unknown>;

function createHarness(queues: Record<string, Row[][]>) {
  const inserts: Array<{ table: string; values: Row }> = [];

  const takeRows = (key: string): Row[] => {
    const queue = queues[key];
    if (!queue || queue.length === 0) return [];
    return queue.length === 1 ? queue[0] : queue.shift()!;
  };

  const tableKey = (tables: string[]): string =>
    [...new Set(tables)].sort().join('+');

  // The fake tx never evaluates WHERE, so an occupancy row is projected onto
  // the columns the capacity query asked for: the same row reads under its
  // division for a division read and under its tournament for a tournament
  // read, exactly as the real join would return it.
  const projectOccupancyRow = (
    fields: Record<string, unknown>,
    row: Row,
  ): Row => {
    const projected: Row = { rosterMemberCount: row.rosterMemberCount };
    for (const [key, column] of Object.entries(fields)) {
      if (key === 'rosterMemberCount') continue;
      if (column === schema.tournamentParticipants.tournamentDivisionId)
        projected[key] =
          row.divisionId !== undefined ? row.divisionId : row.scopeId;
      else if (column === schema.tournamentParticipants.tournamentId)
        projected[key] = row.tournamentId ?? row.scopeId ?? null;
      else projected[key] = row[key];
    }
    return projected;
  };

  const tx = {
    select: (fields?: Record<string, unknown>) => {
      const tables: string[] = [];
      const query: Record<string, unknown> = {};

      const record = (fn: (...args: unknown[]) => unknown) => (
        ...args: unknown[]
      ) => {
        for (const arg of args) {
          const name = TABLE_KEYS.get(arg);
          if (name) tables.push(name);
        }
        return fn(...args);
      };

      query.from = record(() => query);
      query.innerJoin = record(() => query);
      query.leftJoin = record(() => query);
      query.where = () => query;
      query.groupBy = () => query;
      query.orderBy = () => query;
      query.limit = () => query;
      query.for = () => query;
      query.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve()
          .then(() => {
            const rows = takeRows(tableKey(tables));
            return fields && 'rosterMemberCount' in fields
              ? rows.map((row) => projectOccupancyRow(fields, row))
              : rows;
          })
          .then(resolve, reject);

      return query;
    },
    insert: (table: unknown) => {
      const name = TABLE_KEYS.get(table) ?? 'unknown';
      return {
        values: (values: Row) => {
          inserts.push({ table: name, values });
          return {
            returning: async () => [
              { id: `participant-${inserts.length}`, ...values },
            ],
          };
        },
      };
    },
  };

  return { tx: tx as unknown as Record<string, unknown>, inserts };
}

function createRepository(tx: unknown) {
  const db = {
    transaction: async (callback: (inner: unknown) => unknown) => callback(tx),
  };
  const paymentRepository = {
    resolveDivisionEntryFee: jest.fn().mockResolvedValue(0),
  };

  return new TournamentImportRepository(
    db as never,
    paymentRepository as never,
  );
}

const PAIR = {
  teamName: 'Cặp đôi',
  player1Name: 'Nguyen Van A',
  player2Name: 'Nguyen Van B',
  autoApprove: true,
};

const COMPLETE_PAIR: Row = {
  scopeId: 'division-1',
  tournamentId: 'tournament-1',
  teamStatus: 'COMPLETE',
  rosterMemberCount: 2,
  customResponses: null,
};

const LONE_MEMBER: Row = {
  scopeId: 'division-1',
  tournamentId: 'tournament-1',
  teamStatus: 'PENDING_PARTNER',
  rosterMemberCount: 1,
  customResponses: null,
};

const SOLO_ROSTER_ENTRY = {
  teamName: 'Nguyen Van A',
  player1Name: 'Nguyen Van A',
  autoApprove: true,
};

function divisionImportQueues(options: {
  entries: Row[];
  tournamentConfig?: unknown;
}): Record<string, Row[][]> {
  return {
    tournaments: [
      [
        {
          id: 'tournament-1',
          matchType: 'DOUBLES',
          maxParticipants: 4,
          tournamentConfig: options.tournamentConfig ?? null,
          entryFee: 0,
        },
      ],
      [{ id: 'tournament-1' }],
    ],
    divisions: [
      [{ id: 'division-1', tournamentId: 'tournament-1', matchType: 'DOUBLES' }],
      [{ id: 'division-1' }],
    ],
    'divisions+tournaments': [
      [
        {
          id: 'division-1',
          matchType: 'DOUBLES',
          maxParticipants: 4,
          tournamentConfig: options.tournamentConfig ?? null,
        },
      ],
    ],
    'participants+rosters': [options.entries],
  };
}

describe('bulk doubles import capacity', () => {
  it('weighs unpaired members as half a team instead of one row each', async () => {
    // Four unpaired doubles members are four rows but only two team slots, so
    // importing two more pairs exactly fills the four-team cap.
    const harness = createHarness(
      divisionImportQueues({
        entries: [LONE_MEMBER, LONE_MEMBER, LONE_MEMBER, LONE_MEMBER],
      }),
    );

    const result = await createRepository(harness.tx).importParticipants(
      'tournament-1',
      'organizer-1',
      [PAIR, PAIR],
      'division-1',
    );

    expect(result.importedCount).toBe(2);
    expect(
      harness.inserts.filter((insert) => insert.table === 'participants'),
    ).toHaveLength(2);
  });

  it('rejects an import that would overflow the division and writes nothing', async () => {
    const harness = createHarness(
      divisionImportQueues({
        entries: [COMPLETE_PAIR, COMPLETE_PAIR, COMPLETE_PAIR],
      }),
    );

    await expect(
      createRepository(harness.tx).importParticipants(
        'tournament-1',
        'organizer-1',
        [PAIR, PAIR],
        'division-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(harness.inserts).toHaveLength(0);
  });

  it('counts a football squad as one whole team, not half a team per athlete', async () => {
    // Three complete squads fill three of four teams even though each roster
    // holds eleven athletes.
    const harness = createHarness(
      divisionImportQueues({
        entries: [COMPLETE_PAIR, COMPLETE_PAIR, COMPLETE_PAIR],
        tournamentConfig: { teamSize: 11, minTeamSize: 7 },
      }),
    );

    const result = await createRepository(harness.tx).importParticipants(
      'tournament-1',
      'organizer-1',
      [PAIR],
      'division-1',
    );

    expect(result.importedCount).toBe(1);
  });

  it('never blocks a tournament without a configured limit', async () => {
    const uncappedTournament: Row = {
      id: 'tournament-1',
      matchType: 'DOUBLES',
      maxParticipants: null,
      tournamentConfig: null,
      entryFee: 0,
    };
    const harness = createHarness({
      tournaments: [
        [uncappedTournament],
        [{ id: 'tournament-1' }],
        [uncappedTournament],
      ],
      'participants+rosters': [
        Array.from({ length: 40 }, () => COMPLETE_PAIR),
      ],
      // A tournament-wide occupancy read also carries each row's division
      // format, so its rows arrive under the joined read.
      'divisions+participants+rosters': [
        Array.from({ length: 40 }, () => COMPLETE_PAIR),
      ],
    });

    const result = await createRepository(harness.tx).importParticipants(
      'tournament-1',
      'organizer-1',
      [PAIR],
    );

    expect(result.importedCount).toBe(1);
  });
});

describe('imported pair metadata survives caller-supplied form answers', () => {
  it('keeps both the form answers and the validated pair metadata', async () => {
    const harness = createHarness(divisionImportQueues({ entries: [] }));

    await createRepository(harness.tx).importParticipants(
      'tournament-1',
      'organizer-1',
      [
        {
          ...PAIR,
          customResponses: { shirtSize: 'L', note: 'Đăng ký qua Google Form' },
        },
      ],
      'division-1',
    );

    const participantInsert = harness.inserts.find(
      (insert) => insert.table === 'participants',
    );
    expect(participantInsert?.values.customResponses).toEqual({
      shirtSize: 'L',
      note: 'Đăng ký qua Google Form',
      importedFrom: 'GOOGLE_FORM',
      player2Name: 'Nguyen Van B',
    });
    // Neither contact has an account, so the pair exists only as metadata.
    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(0);
  });

  it('lets the validated second player win over a same-named form answer', async () => {
    const harness = createHarness(divisionImportQueues({ entries: [] }));

    await createRepository(harness.tx).importParticipants(
      'tournament-1',
      'organizer-1',
      [{ ...PAIR, customResponses: { player2Name: 'Ten nhập sai' } }],
      'division-1',
    );

    const participantInsert = harness.inserts.find(
      (insert) => insert.table === 'participants',
    );
    expect(
      (participantInsert?.values.customResponses as Row).player2Name,
    ).toBe('Nguyen Van B');
  });
});

describe('bulk singles import capacity', () => {
  function singlesImportQueues(): Record<string, Row[][]> {
    const tournament: Row = {
      id: 'tournament-1',
      matchType: 'SINGLES',
      maxParticipants: 2,
      tournamentConfig: null,
      entryFee: 0,
    };
    return {
      tournaments: [[tournament], [{ id: 'tournament-1' }], [tournament]],
      divisions: [
        [
          {
            id: 'division-singles',
            tournamentId: 'tournament-1',
            matchType: 'SINGLES',
          },
        ],
        [{ id: 'division-singles' }],
      ],
      'divisions+tournaments': [
        [
          {
            id: 'division-singles',
            matchType: 'SINGLES',
            maxParticipants: 2,
            tournamentConfig: null,
          },
        ],
      ],
      'participants+rosters': [[]],
    };
  }

  it('rejects three singles rows against an empty two-slot cap and writes nothing', async () => {
    // Each singles row owns a whole team, so three rows need three of two slots.
    const harness = createHarness(singlesImportQueues());

    await expect(
      createRepository(harness.tx).importParticipants(
        'tournament-1',
        'organizer-1',
        [SOLO_ROSTER_ENTRY, SOLO_ROSTER_ENTRY, SOLO_ROSTER_ENTRY],
        'division-singles',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(harness.inserts).toHaveLength(0);
  });

  it('admits the two singles rows that exactly fill the cap', async () => {
    const harness = createHarness(singlesImportQueues());

    const result = await createRepository(harness.tx).importParticipants(
      'tournament-1',
      'organizer-1',
      [SOLO_ROSTER_ENTRY, SOLO_ROSTER_ENTRY],
      'division-singles',
    );

    expect(result.importedCount).toBe(2);
  });
});

describe('import into a division that has no limit of its own', () => {
  function tournamentCappedQueues(options: {
    entries: Row[];
    tournamentMaxParticipants: number;
  }): Record<string, Row[][]> {
    const tournament: Row = {
      id: 'tournament-1',
      matchType: 'DOUBLES',
      maxParticipants: options.tournamentMaxParticipants,
      tournamentConfig: null,
      entryFee: 0,
    };
    return {
      tournaments: [[tournament], [{ id: 'tournament-1' }], [tournament]],
      divisions: [
        [
          {
            id: 'division-1',
            tournamentId: 'tournament-1',
            matchType: 'DOUBLES',
          },
        ],
        [{ id: 'division-1' }],
      ],
      'divisions+tournaments': [
        [
          {
            id: 'division-1',
            // The division sets no limit, so its parent tournament governs it;
            // the division row has to name that parent.
            tournamentId: 'tournament-1',
            matchType: 'DOUBLES',
            maxParticipants: null,
            tournamentConfig: null,
          },
        ],
      ],
      'participants+rosters': [options.entries],
      // An uncapped division falls back to the tournament cap, whose occupancy
      // read joins the division to weigh each row by its own format.
      'divisions+participants+rosters': [options.entries],
    };
  }

  it('rejects a full tournament instead of letting an uncapped division through', async () => {
    // Two pairs already hold both tournament teams; two more cannot be added.
    const harness = createHarness(
      tournamentCappedQueues({
        entries: [COMPLETE_PAIR, COMPLETE_PAIR],
        tournamentMaxParticipants: 2,
      }),
    );

    await expect(
      createRepository(harness.tx).importParticipants(
        'tournament-1',
        'organizer-1',
        [PAIR, PAIR],
        'division-1',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(harness.inserts).toHaveLength(0);
  });

  it('still imports when the tournament cap has room left', async () => {
    const harness = createHarness(
      tournamentCappedQueues({
        entries: [COMPLETE_PAIR],
        tournamentMaxParticipants: 4,
      }),
    );

    const result = await createRepository(harness.tx).importParticipants(
      'tournament-1',
      'organizer-1',
      [PAIR, PAIR],
      'division-1',
    );

    expect(result.importedCount).toBe(2);
  });
});