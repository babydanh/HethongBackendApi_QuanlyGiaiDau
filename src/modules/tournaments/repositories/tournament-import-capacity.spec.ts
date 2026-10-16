import { BadRequestException, ConflictException } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../../../database/schema';
import {
  AddAthleteCandidateDto,
  AddAthleteDirectDto,
  ListAddAthleteCandidatesQueryDto,
} from '../dto/add-athlete.dto';
import { AddAthletePairsDto } from '../dto/add-athlete-pairs.dto';
import { TournamentImportRepository } from './tournament-import.repository';
import { RosterImportBatchDto } from '../dto/roster-import-batch.dto';
import { fingerprintRosterImportBatch } from '../validation/roster-import-batch';

// Drizzle tables are object keys, so the lookup must be by identity.
const TABLE_KEYS = new Map<unknown, string>([
  [schema.tournaments, 'tournaments'],
  [schema.tournamentDivisions, 'divisions'],
  [schema.tournamentParticipants, 'participants'],
  [schema.tournamentRosters, 'rosters'],
  [schema.profiles, 'profiles'],
  [schema.users, 'users'],
[schema.friendships, 'friendships'],
[schema.communities, 'communities'],
[schema.communityMembers, 'communityMembers'],
[schema.userBans, 'userBans'],
  [schema.tournamentRosterImportBatches, 'rosterBatches'],
]);
const dialect = new PgDialect();

type Row = Record<string, unknown>;

function createHarness(queues: Record<string, Row[][]>) {
  const inserts: Array<{ table: string; values: Row }> = [];
  const updates: Array<{ table: string; values: Row }> = [];
  const selections: Array<{ key: string; locked: boolean }> = [];
  const whereConditions: Array<{ key: string; predicate: SQL }> = [];
  const lockCounter = { count: 0 };
  const executed: unknown[] = [];
  const takeRows = (key: string): Row[] => {
    const queue = queues[key];
    if (!queue || queue.length === 0) return [];
    return queue.length === 1 ? queue[0] : queue.shift()!;
  };

  const tableKey = (tables: string[]): string =>
    [...new Set(tables)].sort().join('+');

  // The fake tx never evaluates WHERE, so a row is projected onto the columns
  // the query asked for — only those fields, exactly as the real projection
  // would return. An occupancy row additionally reads under its division for a
  // division read and under its tournament for a tournament read.
  const projectRow = (fields: Record<string, unknown>, row: Row): Row => {
    const projected: Row = {};
    for (const [key, column] of Object.entries(fields)) {
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
      let locked = false;

      const record =
        (fn: (...args: unknown[]) => unknown) =>
        (...args: unknown[]) => {
          for (const arg of args) {
            const name = TABLE_KEYS.get(arg);
            if (name) tables.push(name);
          }
          return fn(...args);
        };

      query.from = record(() => query);
      query.innerJoin = record(() => query);
      query.leftJoin = record(() => query);
      query.where = (predicate: SQL) => {
        whereConditions.push({ key: tableKey(tables), predicate });
        return query;
      };
      query.groupBy = () => query;
      query.orderBy = () => query;
      query.limit = () => query;
      query.for = () => {
        lockCounter.count += 1;
        locked = true;
        return query;
      };
      query.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve()
          .then(() => {
            const key = tableKey(tables);
            selections.push({ key, locked });
            const rows = takeRows(key);
            return fields ? rows.map((row) => projectRow(fields, row)) : rows;
          })
          .then(resolve, reject);

      return query;
    },
    insert: (table: unknown) => {
      const name = TABLE_KEYS.get(table) ?? 'unknown';
      return {
        values: (values: Row) => {
          inserts.push({ table: name, values });
          const builder = {
            onConflictDoNothing: () => builder,
            returning: async () => [
              {
                id:
                  name === 'rosterBatches'
                    ? `batch-${inserts.length}`
                    : `participant-${inserts.length}`,
                ...values,
              },
            ],
          };
          return builder;
        },
      };
    },
    update: (table: unknown) => {
      const name = TABLE_KEYS.get(table) ?? 'unknown';
      return {
        set: (values: Row) => ({
          where: async () => updates.push({ table: name, values }),
        }),
      };
    },
    execute: (query: unknown) => {
      executed.push(query);
      return Promise.resolve([]);
    },
    __snapshot: () => ({ inserts: inserts.length, updates: updates.length }),
    __rollback: (snapshot: { inserts: number; updates: number }) => {
      inserts.length = snapshot.inserts;
      updates.length = snapshot.updates;
    },
  };

  return {
    tx: tx as unknown as Record<string, unknown>,
    inserts,
    updates,
    selections,
    whereConditions,
    executed,
    lockCount: () => lockCounter.count,
  };
}

function createRepository(
  tx: unknown,
  paymentRepository = {
    resolveDivisionEntryFee: jest.fn().mockResolvedValue(0),
  },
) {
  const transactional = tx as {
    __snapshot: () => { inserts: number; updates: number };
    __rollback: (snapshot: { inserts: number; updates: number }) => void;
  };
  const db = {
    transaction: async (callback: (inner: unknown) => unknown) => {
      const snapshot = transactional.__snapshot();
      try {
        return await callback(tx);
      } catch (error) {
        transactional.__rollback(snapshot);
        throw error;
      }
    },
    select: (fields?: Record<string, unknown>) =>
      (
        tx as {
          select: (value?: Record<string, unknown>) => unknown;
        }
      ).select(fields),
  };
  return new TournamentImportRepository(
    db as never,
    paymentRepository as never,
  );

}

describe('TournamentImportRepository.previewRosterImport', () => {
  it('returns row and capacity verdicts without writes or capacity locks', async () => {
    const tournament = {
      id: 'tournament-1',
      matchType: 'SINGLES',
      maxParticipants: 4,
      tournamentConfig: null,
      entryFee: 0,
    };
    const { tx, inserts, lockCount } = createHarness({
      tournaments: [[tournament], [tournament]],
      participants: [[]],
      users: [[]],
      'participants+rosters': [[]],
    });
    const repository = createRepository(tx);

    const result = await repository.previewRosterImport('tournament-1', {
      participants: [
        {
          teamName: 'Guest entrant',
          player1Name: 'Guest entrant',
          player1Email: 'guest@example.test',
          source: 'EXCEL',
        },
      ],
    });

    expect(result.rows[0]).toMatchObject({
      rowIndex: 0,
      status: ['NOT_FOUND'],
      isEligible: true,
      capacityDelta: 1,
    });
    expect(result.requestedTeamSlots).toBe(1);
    expect(result.capacityRemaining).toBe(4);
    expect(lockCount()).toBe(0);
    expect(inserts).toHaveLength(0);
  });
});

describe('TournamentImportRepository.previewRosterImportBatch', () => {
  it('previews divisions together and blocks duplicate email identities without linking accounts', async () => {
    const tournament = {
      id: 'tournament-1',
      matchType: 'SINGLES',
      maxParticipants: null,
      tournamentConfig: null,
      entryFee: 0,
    };
    const divisionRows = [
      {
        id: 'division-1',
        tournamentId: 'tournament-1',
        name: 'Singles A',
        matchType: 'SINGLES',
        maxParticipants: 4,
        tournamentConfig: null,
      },
      {
        id: 'division-2',
        tournamentId: 'tournament-1',
        name: 'Singles B',
        matchType: 'SINGLES',
        maxParticipants: 4,
        tournamentConfig: null,
      },
    ];
    const harness = createHarness({
      tournaments: [[tournament]],
      divisions: [divisionRows],
      'participants+rosters': [[], []],
      'divisions+tournaments': [divisionRows],
      'profiles+users': [[
        {
          id: 'eligible-user',
          email: 'shared@example.test',
          fullName: 'Exact candidate',
          avatarUrl: 'https://cdn.example.test/exact.png',
        },
      ]],
    });
    const repository = createRepository(harness.tx) as unknown as {
      previewRosterImportBatch: (
        tournamentId: string,
        dto: unknown,
      ) => Promise<{
        totalParticipants: number;
        groups: Array<{
          rows: Array<{
            clientRowIndex: number;
            status: string[];
            isEligible: boolean;
            accountCandidates: {
              player1: Array<{ userId: string; email: string }>;
            };
          }>;
        }>;
      }>;
    };

    const result = await repository.previewRosterImportBatch('tournament-1', {
      groups: [
        {
          divisionId: 'division-1',
          participants: [
            {
              teamName: 'Entrant one',
              player1Name: 'Player one',
              player1Email: 'shared@example.test',
              source: 'EXCEL',
              clientRowIndex: 11,
            },
          ],
        },
        {
          divisionId: 'division-2',
          participants: [
            {
              teamName: 'Entrant two',
              player1Name: 'Player two',
              player1Email: 'SHARED@example.test',
              source: 'EXCEL',
              clientRowIndex: 17,
            },
          ],
        },
      ],
    });

    expect(result.totalParticipants).toBe(2);
    expect(result.groups.map((group) => group.rows[0])).toEqual([
      expect.objectContaining({
        clientRowIndex: 11,
        status: expect.arrayContaining(['DUPLICATE_IN_FILE']),
        isEligible: false,
        accountCandidates: {
          player1: [
            {
              userId: 'eligible-user',
              email: 'shared@example.test',
              fullName: 'Exact candidate',
              avatarUrl: 'https://cdn.example.test/exact.png',
            },
          ],
          player2: [],
        },
      }),
      expect.objectContaining({
        clientRowIndex: 17,
        status: expect.arrayContaining(['DUPLICATE_IN_FILE']),
        isEligible: false,
      }),
    ]);
  });

  it('returns published-form validation errors on the affected preview row', async () => {
    const division = {
      id: 'division-1',
      tournamentId: 'tournament-1',
      name: 'Singles A',
      matchType: 'SINGLES',
      maxParticipants: 4,
      tournamentConfig: null,
    };
    const tournament = {
      id: 'tournament-1',
      matchType: 'SINGLES',
      maxParticipants: null,
      entryFee: 0,
      tournamentConfig: {
        registrationForm: {
          status: 'PUBLISHED',
          divisionIds: ['division-1'],
          fields: [
            {
              id: 'contact_note',
              type: 'TEXT',
              label: 'Thông tin liên hệ',
              required: true,
            },
          ],
        },
      },
    };
    const harness = createHarness({
      tournaments: [[tournament]],
      divisions: [[division]],
      'participants+rosters': [[], []],
      'divisions+tournaments': [[division]],
      'profiles+users': [[]],
    });
    const dto = Object.assign(new RosterImportBatchDto(), {
      groups: [
        {
          divisionId: 'division-1',
          participants: [
            {
              teamName: 'Guest',
              player1Name: 'Player',
              player1Email: 'player@example.test',
              source: 'EXCEL',
            },
          ],
        },
      ],
    });

    const result = await createRepository(harness.tx).previewRosterImportBatch(
      'tournament-1',
      dto,
    );

    expect(result.groups[0].rows[0].customResponseError).toBe(
      'Vui lòng điền trường “Thông tin liên hệ”.',
    );
  });
});

describe('TournamentImportRepository.importRosterBatch', () => {
  const tournament = {
    id: 'tournament-1',
    matchType: 'SINGLES',
    maxParticipants: null,
    tournamentConfig: null,
    entryFee: 0,
  };
  const divisions = [
    {
      id: 'division-1',
      tournamentId: 'tournament-1',
      name: 'Singles A',
      matchType: 'SINGLES',
      maxParticipants: 4,
      tournamentConfig: null,
    },
    {
      id: 'division-2',
      tournamentId: 'tournament-1',
      name: 'Singles B',
      matchType: 'SINGLES',
      maxParticipants: 4,
      tournamentConfig: null,
    },
  ];
  const makeDto = (secondCustomResponses?: Record<string, unknown>) =>
    Object.assign(new RosterImportBatchDto(), {
      groups: [
        {
          divisionId: 'division-1',
          participants: [
            {
              teamName: 'Confirmed by email',
              player1Name: 'Exact candidate',
              player1Email: 'eligible@example.test',
              source: 'EXCEL',
              confirmedPlayer1UserId: 'eligible-user',
              customResponses: { notes: 'Checked by organizer' },
            },
          ],
        },
        {
          divisionId: 'division-2',
          participants: [
            {
              teamName: 'Same name, different email',
              player1Name: 'Exact candidate',
              player1Email: 'unmatched@example.test',
              source: 'EXCEL',
              customResponses: secondCustomResponses,
            },
          ],
        },
      ],
    });
  const makeQueues = (rosterBatches: Row[][] = [[]]) => ({
    rosterBatches,
    tournaments: [[tournament]],
    divisions: [divisions],
    'participants+rosters': [[], []],
    'divisions+tournaments': [divisions],
    'profiles+users': [[
      {
        id: 'eligible-user',
        email: 'eligible@example.test',
        fullName: 'Exact candidate',
      },
    ]],
  });

  it('commits all divisions atomically and links only the explicitly confirmed exact-email account', async () => {
    const dto = makeDto();
    const harness = createHarness(makeQueues());

    const result = await createRepository(harness.tx).importRosterBatch(
      'tournament-1',
      'organizer-1',
      dto,
      'stable-key',
    );

    const participantRows = harness.inserts
      .filter((insert) => insert.table === 'participants')
      .map((insert) => insert.values);
    expect(result).toMatchObject({ importedCount: 2, replayed: false });
    expect(participantRows.map((row) => row.registeredBy)).toEqual([
      'eligible-user',
      'organizer-1',
    ]);
    expect(participantRows.map((row) => row.tournamentDivisionId)).toEqual([
      'division-1',
      'division-2',
    ]);
    expect(harness.inserts.filter((insert) => insert.table === 'rosters')).toHaveLength(1);
    expect(harness.updates).toEqual([
      { table: 'rosterBatches', values: { importedCount: 2 } },
    ]);
    expect(harness.lockCount()).toBeGreaterThan(0);
  });

  it('aggregates inherited division claims before inserting any part of a workbook', async () => {
    const tournamentWithCap = { ...tournament, maxParticipants: 1 };
    const inheritedDivisions = divisions.map((division) => ({
      ...division,
      maxParticipants: null,
    }));
    const harness = createHarness({
      rosterBatches: [[]],
      tournaments: [[tournamentWithCap]],
      divisions: [inheritedDivisions],
      'participants+rosters': [[]],
      'divisions+tournaments': [inheritedDivisions],
      'divisions+participants+rosters': [[]],
      'profiles+users': [[
        {
          id: 'eligible-user',
          email: 'eligible@example.test',
          fullName: 'Exact candidate',
        },
      ]],
    });

    await expect(
      createRepository(harness.tx).importRosterBatch(
        'tournament-1',
        'organizer-1',
        makeDto(),
        'stable-key',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.inserts).toEqual([]);
    expect(harness.lockCount()).toBeGreaterThan(0);
  });

  it('validates every division custom response before inserting the workbook', async () => {
    const dto = makeDto({ unapprovedField: 'must reject' });
    const harness = createHarness(makeQueues());

    await expect(
      createRepository(harness.tx).importRosterBatch(
        'tournament-1',
        'organizer-1',
        dto,
        'stable-key',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.inserts).toEqual([]);
    expect(harness.updates).toEqual([]);
  });

  it('rolls back completed earlier divisions when a later insert-stage operation fails', async () => {
    const harness = createHarness(makeQueues());
    const resolveDivisionEntryFee = jest
      .fn()
      .mockResolvedValueOnce(0)
      .mockRejectedValueOnce(new Error('fee lookup failed'));

    await expect(
      createRepository(harness.tx, { resolveDivisionEntryFee }).importRosterBatch(
        'tournament-1',
        'organizer-1',
        makeDto(),
        'stable-key',
      ),
    ).rejects.toThrow('fee lookup failed');

    expect(harness.inserts).toEqual([]);
    expect(harness.updates).toEqual([]);
  });

  it('replays the stored count without writing rows again', async () => {
    const dto = makeDto();
    const harness = createHarness(
      makeQueues([
        [
          {
            id: 'batch-1',
            requestFingerprint: fingerprintRosterImportBatch(dto),
            importedCount: 2,
          },
        ],
      ]),
    );

    await expect(
      createRepository(harness.tx).importRosterBatch(
        'tournament-1',
        'organizer-1',
        dto,
        'stable-key',
      ),
    ).resolves.toMatchObject({ importedCount: 2, replayed: true });
    expect(harness.inserts).toEqual([]);
    expect(harness.updates).toEqual([]);
  });

  it('rejects reuse of an idempotency key for a different workbook', async () => {
    const dto = makeDto();
    const changedDto = makeDto({ notes: 'different workbook' });
    const harness = createHarness(
      makeQueues([
        [
          {
            requestFingerprint: fingerprintRosterImportBatch(dto),
            importedCount: 2,
          },
        ],
      ]),
    );

    await expect(
      createRepository(harness.tx).findRosterImportBatchReplay(
        'tournament-1',
        'organizer-1',
        changedDto,
        'stable-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

const PAIR = {
  teamName: 'Cặp đôi',
  player1Name: 'Nguyen Van A',
  player1Email: 'player-one@example.test',
  player2Name: 'Nguyen Van B',
  player2Email: 'player-two@example.test',
  autoApprove: true,
  source: 'GOOGLE_FORM' as const,
};

const PAIR_TWO = {
  teamName: 'Cặp đôi thứ hai',
  player1Name: 'Nguyen Van C',
  player1Email: 'player-three@example.test',
  player2Name: 'Nguyen Van D',
  player2Email: 'player-four@example.test',
  autoApprove: true,
  source: 'GOOGLE_FORM' as const,
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
  player1Email: 'solo@example.test',
  autoApprove: true,
  source: 'EXCEL' as const,
};

const SOLO_ROSTER_ENTRY_TWO = {
  ...SOLO_ROSTER_ENTRY,
  teamName: 'Nguyen Van B',
  player1Name: 'Nguyen Van B',
  player1Email: 'solo-two@example.test',
};

const SOLO_ROSTER_ENTRY_THREE = {
  ...SOLO_ROSTER_ENTRY,
  teamName: 'Nguyen Van C',
  player1Name: 'Nguyen Van C',
  player1Email: 'solo-three@example.test',
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

    const result = await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [PAIR, PAIR_TWO],
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
      createRepository(harness.tx).importRosterRows(
        'tournament-1',
        'organizer-1',
        [PAIR, PAIR_TWO],
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

    const result = await createRepository(harness.tx).importRosterRows(
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
      'participants+rosters': [Array.from({ length: 40 }, () => COMPLETE_PAIR)],
      // A tournament-wide occupancy read also carries each row's division
      // format, so its rows arrive under the joined read.
      'divisions+participants+rosters': [
        Array.from({ length: 40 }, () => COMPLETE_PAIR),
      ],
    });

    const result = await createRepository(harness.tx).importRosterRows(
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

    await createRepository(harness.tx).importRosterRows(
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
      player1Email: 'player-one@example.test',
      player2Name: 'Nguyen Van B',
      player2Email: 'player-two@example.test',
    });
    // Neither contact has an account, so the pair exists only as metadata.
    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(0);
  });

  it('lets the validated second player win over a same-named form answer', async () => {
    const harness = createHarness(divisionImportQueues({ entries: [] }));

    await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [{ ...PAIR, customResponses: { player2Name: 'Ten nhập sai' } }],
      'division-1',
    );

    const participantInsert = harness.inserts.find(
      (insert) => insert.table === 'participants',
    );
    expect((participantInsert?.values.customResponses as Row).player2Name).toBe(
      'Nguyen Van B',
    );
  });
});

describe('doubles import row naming only athlete 1', () => {
  it('waits for the organizer to pair it instead of becoming a team of one', async () => {
    const harness = createHarness(divisionImportQueues({ entries: [] }));

    await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [SOLO_ROSTER_ENTRY, PAIR],
      'division-1',
    );

    const statuses = harness.inserts
      .filter((insert) => insert.table === 'participants')
      .map((insert) => insert.values.teamStatus);
    expect(statuses).toEqual(['PENDING_PARTNER', 'COMPLETE']);
  });

  it('stays pending approval when the organizer did not approve it on import', async () => {
    const harness = createHarness(divisionImportQueues({ entries: [] }));

    await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [{ ...SOLO_ROSTER_ENTRY, autoApprove: false }],
      'division-1',
    );

    expect(
      harness.inserts.find((insert) => insert.table === 'participants')?.values
        .teamStatus,
    ).toBe('PENDING_APPROVAL');
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
      createRepository(harness.tx).importRosterRows(
        'tournament-1',
        'organizer-1',
        [SOLO_ROSTER_ENTRY, SOLO_ROSTER_ENTRY_TWO, SOLO_ROSTER_ENTRY_THREE],
        'division-singles',
      ),
    ).rejects.toThrow(BadRequestException);

    expect(harness.inserts).toHaveLength(0);
  });

  it('admits the two singles rows that exactly fill the cap', async () => {
    const harness = createHarness(singlesImportQueues());

    const result = await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [SOLO_ROSTER_ENTRY, SOLO_ROSTER_ENTRY_TWO],
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
      createRepository(harness.tx).importRosterRows(
        'tournament-1',
        'organizer-1',
        [PAIR, PAIR_TWO],
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

    const result = await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [PAIR, PAIR_TWO],
      'division-1',
    );

    expect(result.importedCount).toBe(2);
  });
});

type AddAthleteRepository = {
  listAddAthleteCandidates(
    tournamentId: string,
    organizerUserId: string,
    communityId: string | null,
    dto: ListAddAthleteCandidatesQueryDto,
  ): Promise<{ items: Array<{ userId: string; fullName: string }> }>;
  addAthleteCandidate(
    tournamentId: string,
    organizerUserId: string,
    dto: AddAthleteCandidateDto,
  ): Promise<Row>;
  addDirectAthlete(
    tournamentId: string,
    organizerUserId: string,
    dto: AddAthleteDirectDto,
  ): Promise<Row>;
};

function createAddAthleteRepository(tx: unknown): AddAthleteRepository {
  return createRepository(tx) as unknown as AddAthleteRepository;
}

function addAthleteQueues(options: {
  source: 'FRIENDS' | 'CLUB' | 'EMAIL';
  relationRows: Row[];
  duplicateRows: Row[];
  occupancyRows: Row[];
  divisionLimit?: number;
  emailAccount?: Row[];
  tournamentCommunityId?: string | null;
}): Record<string, Row[][]> {
  const tournament: Row = {
    id: 'tournament-1',
    communityId:
      options.tournamentCommunityId !== undefined
        ? options.tournamentCommunityId
        : 'community-1',
    status: 'REGISTRATION_OPEN',
    isRegistrationLocked: false,
    matchType: 'SINGLES',
    maxParticipants: 4,
    tournamentConfig: null,
    entryFee: 0,
  };
  const division: Row = {
    id: 'division-1',
    tournamentId: 'tournament-1',
    matchType: 'SINGLES',
    maxParticipants: options.divisionLimit ?? 4,
    tournamentConfig: null,
  };
  const queues: Record<string, Row[][]> = {
    tournaments: [[tournament], [tournament]],
    divisions: [[division], [division]],
    'divisions+tournaments': [[division]],
    'profiles+users': [[{ id: 'athlete-1', fullName: 'VĐV thử nghiệm' }]],
    'participants+rosters': [
      options.duplicateRows,
      options.occupancyRows,
    ],
  };

  if (options.source === 'FRIENDS') {
    queues.friendships = [options.relationRows];
  } else if (options.source === 'CLUB') {
    queues['communities+communityMembers'] = [options.relationRows];
  } else {
    queues.users = [options.emailAccount ?? [{ id: 'athlete-1' }]];
  }
  return queues;
}

describe('TournamentImportRepository organizer add-athlete flow', () => {
  const candidateDto = Object.assign(new AddAthleteCandidateDto(), {
    source: 'FRIENDS',
    userId: 'athlete-1',
    tournamentDivisionId: 'division-1',
  });

  it('projects approved profile and linked-club image fields without private data', async () => {
    const harness = createHarness({
      'communities+profiles+users': [
        [
          {
            userId: 'athlete-1',
            fullName: 'VĐV thử nghiệm',
            avatarUrl: 'https://avatars.example.test/athlete.png',
            logoUrl: 'https://clubs.example.test/community.png',
            email: 'private@example.test',
            phoneNumber: '0900000000',
          },
        ],
      ],
    });

    const result = await createAddAthleteRepository(harness.tx)
      .listAddAthleteCandidates(
        'tournament-1',
        'organizer-1',
        'community-1',
        Object.assign(new ListAddAthleteCandidatesQueryDto(), {
          source: 'CLUB',
        }),
      );

    expect(result).toEqual({
      items: [
        {
          userId: 'athlete-1',
          fullName: 'VĐV thử nghiệm',
          avatarUrl: 'https://avatars.example.test/athlete.png',
          logoUrl: 'https://clubs.example.test/community.png',
        },
      ],
    });
  });
  it('lists organizer club members for public tournaments without a linked community', async () => {
    const harness = createHarness({
      'communities+communityMembers': [[{ id: 'shared-club-membership' }]],
      'communities+profiles+users': [
        [
          {
            userId: 'club-athlete',
            fullName: 'Club athlete',
            avatarUrl: null,
          },
        ],
      ],
    });

    const result = await createAddAthleteRepository(harness.tx)
      .listAddAthleteCandidates(
        'tournament-public',
        'organizer-1',
        null,
        Object.assign(new ListAddAthleteCandidatesQueryDto(), {
          source: 'CLUB',
        }),
      );

    expect(result.items).toEqual([
      expect.objectContaining({
        userId: 'club-athlete',
        fullName: 'Club athlete',
      }),
    ]);
    const organizerMembershipPredicate = harness.whereConditions
      .filter(({ key }) => key === 'communities+communityMembers')
      .map(({ predicate }) => dialect.sqlToQuery(predicate))
      .find(({ params }) => params.includes('organizer-1'));
    expect(organizerMembershipPredicate).toBeDefined();
    expect(organizerMembershipPredicate!.params).toEqual(
      expect.arrayContaining(['organizer-1', 'JOINED', 'ACTIVE']),
    );
    expect(organizerMembershipPredicate!.sql).toContain('deleted_at');
  });
  it('revalidates organizer-club membership for public tournament adds', async () => {
    const harness = createHarness(
      addAthleteQueues({
        source: 'CLUB',
        relationRows: [{ id: 'shared-club-membership' }],
        duplicateRows: [],
        occupancyRows: [],
        tournamentCommunityId: null,
      }),
    );
    const dto = Object.assign(new AddAthleteCandidateDto(), {
      ...candidateDto,
      source: 'CLUB',
    });

    const result = await createAddAthleteRepository(harness.tx)
      .addAthleteCandidate('tournament-1', 'organizer-1', dto);

    expect(result.participant).toHaveProperty(
      'teamName',
      'VĐV thử nghiệm',
    );
    expect(harness.inserts.filter(({ table }) => table === 'rosters'))
      .toHaveLength(1);
    const membershipPredicate = harness.whereConditions.find(
      ({ key }) => key === 'communities+communityMembers',
    )?.predicate;
    expect(membershipPredicate).toBeDefined();
    const query = dialect.sqlToQuery(membershipPredicate!);
    expect(query.params).toEqual(
      expect.arrayContaining(['organizer-1', 'JOINED', 'ACTIVE']),
    );
  });

  it.each([['FRIENDS'], ['CLUB']] as const)(
    'rejects a stale %s relationship after capacity locks',
    async (source) => {
      const harness = createHarness(
        addAthleteQueues({
          source,
          relationRows: [],
          duplicateRows: [],
          occupancyRows: [],
        }),
      );
      const dto = Object.assign(new AddAthleteCandidateDto(), {
        ...candidateDto,
        source,
      });

      await expect(
        createAddAthleteRepository(harness.tx).addAthleteCandidate(
          'tournament-1',
          'organizer-1',
          dto,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(harness.inserts).toHaveLength(0);
      expect(harness.selections.slice(0, 2)).toEqual([
        { key: 'tournaments', locked: true },
        { key: 'divisions', locked: true },
      ]);
      expect(harness.selections[2]?.key).toBe('tournaments');
    },
  );
  it('revalidates verified email accounts inside the add transaction', async () => {
    const harness = createHarness(
      addAthleteQueues({
        source: 'EMAIL',
        relationRows: [],
        duplicateRows: [],
        occupancyRows: [],
      }),
    );
    const dto = Object.assign(new AddAthleteCandidateDto(), {
      ...candidateDto,
      source: 'EMAIL' as unknown as AddAthleteCandidateDto['source'],
    });

    const result = await createAddAthleteRepository(harness.tx)
      .addAthleteCandidate('tournament-1', 'organizer-1', dto);
    const accountCheck = harness.whereConditions.find(
      ({ key }) => key === 'users',
    )?.predicate;

    expect(result.participant.teamName).toBe('VĐV thử nghiệm');
    expect(accountCheck).toBeDefined();
    expect(dialect.sqlToQuery(accountCheck!).sql).toContain('is_email_verified');
    expect(harness.inserts.filter((insert) => insert.table === 'rosters'))
      .toHaveLength(1);
  });

  it('rejects an email candidate no longer eligible before writing', async () => {
    const harness = createHarness(
      addAthleteQueues({
        source: 'EMAIL',
        relationRows: [],
        duplicateRows: [],
        occupancyRows: [],
        emailAccount: [],
      }),
    );
    const dto = Object.assign(new AddAthleteCandidateDto(), {
      ...candidateDto,
      source: 'EMAIL' as unknown as AddAthleteCandidateDto['source'],
    });

    await expect(
      createAddAthleteRepository(harness.tx).addAthleteCandidate(
        'tournament-1',
        'organizer-1',
        dto,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.inserts).toHaveLength(0);
  });


  it('rejects an active roster duplicate without writing another participant', async () => {
    const harness = createHarness(
      addAthleteQueues({
        source: 'FRIENDS',
        relationRows: [{ id: 'friendship-1' }],
        duplicateRows: [{ id: 'participant-existing' }],
        occupancyRows: [],
      }),
    );

    await expect(
      createAddAthleteRepository(harness.tx).addAthleteCandidate(
        'tournament-1',
        'organizer-1',
        candidateDto,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(harness.inserts).toHaveLength(0);
  });

  it('rejects a candidate when the locked division capacity is full', async () => {
    const harness = createHarness(
      addAthleteQueues({
        source: 'FRIENDS',
        relationRows: [{ id: 'friendship-1' }],
        duplicateRows: [],
        occupancyRows: [
          {
            teamStatus: 'PENDING_APPROVAL',
            rosterMemberCount: 1,
            tournamentId: 'tournament-1',
            divisionId: 'division-1',
          },
        ],
        divisionLimit: 1,
      }),
    );

    await expect(
      createAddAthleteRepository(harness.tx).addAthleteCandidate(
        'tournament-1',
        'organizer-1',
        candidateDto,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.inserts).toHaveLength(0);
  });

  it('writes a linked candidate without setting athlete ranking consent', async () => {
    const harness = createHarness(
      addAthleteQueues({
        source: 'FRIENDS',
        relationRows: [{ id: 'friendship-1' }],
        duplicateRows: [],
        occupancyRows: [],
      }),
    );

    const result = await createAddAthleteRepository(harness.tx)
      .addAthleteCandidate('tournament-1', 'organizer-1', candidateDto);
    const participant = harness.inserts.find(
      (insert) => insert.table === 'participants',
    );
    const roster = harness.inserts.find((insert) => insert.table === 'rosters');

    expect(result.participant).toMatchObject({
      participantId: expect.any(String),
      teamStatus: 'PENDING_APPROVAL',
    });
    expect(participant?.values).toMatchObject({
      registeredBy: 'organizer-1',
      teamName: 'VĐV thử nghiệm',
    });
    expect(roster?.values).toMatchObject({ userId: 'athlete-1' });
    expect(roster?.values).not.toHaveProperty('rankingConsentAt');
  });

  it('stores a direct entry as unlinked metadata and checks capacity', async () => {
    const queues: Record<string, Row[][]> = {
      tournaments: [
        [
          {
            id: 'tournament-1',
            status: 'REGISTRATION_OPEN',
            isRegistrationLocked: false,
            matchType: 'DOUBLES',
            maxParticipants: 4,
            tournamentConfig: null,
            entryFee: 0,
          },
        ],
        [
          {
            id: 'tournament-1',
            status: 'REGISTRATION_OPEN',
            isRegistrationLocked: false,
            matchType: 'DOUBLES',
            maxParticipants: 4,
            tournamentConfig: null,
            entryFee: 0,
          },
        ],
      ],
      divisions: [
        [
          {
            id: 'division-1',
            tournamentId: 'tournament-1',
            matchType: 'DOUBLES',
            maxParticipants: 4,
            tournamentConfig: null,
          },
        ],
        [
          {
            id: 'division-1',
            tournamentId: 'tournament-1',
            matchType: 'DOUBLES',
            maxParticipants: 4,
            tournamentConfig: null,
          },
        ],
      ],
      'divisions+tournaments': [
        [
          {
            id: 'division-1',
            tournamentId: 'tournament-1',
            matchType: 'DOUBLES',
            maxParticipants: 4,
            tournamentConfig: null,
          },
        ],
      ],
      'participants+rosters': [[]],
    };
    const harness = createHarness(queues);

    await createAddAthleteRepository(harness.tx).addDirectAthlete(
      'tournament-1',
      'organizer-1',
      Object.assign(new AddAthleteDirectDto(), {
        name: 'Khách trực tiếp',
        email: 'guest@example.test',
        tournamentDivisionId: 'division-1',
      }),
    );

    const participant = harness.inserts.find(
      (insert) => insert.table === 'participants',
    );
    expect(participant?.values).toMatchObject({
      registeredBy: 'organizer-1',
      teamName: 'Khách trực tiếp',
      customResponses: {
        importedFrom: 'ORGANIZER_DIRECT',
        player1Email: 'guest@example.test',
      },
    });
    expect(
      harness.inserts.filter((insert) => insert.table === 'rosters'),
    ).toHaveLength(0);
  });
});

describe('TournamentImportRepository organizer add-athlete pairs flow', () => {
  const pairsDto = (userIds: string[]) =>
    Object.assign(new AddAthletePairsDto(), {
      source: 'FRIENDS',
      tournamentDivisionId: 'division-1',
      userIds,
    });

  function addAthletePairsQueues(options: {
    userIds: string[];
    matchType?: string;
    genderRestriction?: string | null;
    genders?: Array<string | null>;
    fullNames?: string[];
    tournamentConfig?: unknown;
    divisionLimit?: number;
    duplicateRows?: Row[][];
    relationRows?: Row[];
    occupancyRows?: Row[];
    isRegistrationLocked?: boolean;
  }): Record<string, Row[][]> {
    const matchType = options.matchType ?? 'DOUBLES';
    const tournament: Row = {
      id: 'tournament-1',
      communityId: 'community-1',
      status: 'REGISTRATION_OPEN',
      isRegistrationLocked: options.isRegistrationLocked ?? false,
      matchType,
      maxParticipants: 8,
      tournamentConfig: options.tournamentConfig ?? null,
      entryFee: 150000,
    };
    const division: Row = {
      id: 'division-1',
      tournamentId: 'tournament-1',
      matchType,
      genderRestriction: options.genderRestriction ?? null,
      maxParticipants: options.divisionLimit ?? 8,
      tournamentConfig: null,
    };
    const duplicates = options.duplicateRows ?? [];
    return {
      tournaments: [[tournament], [tournament]],
      divisions: [[division], [division]],
      'divisions+tournaments': [[division]],
      friendships: [options.relationRows ?? [{ id: 'friendship-1' }]],
      'profiles+users': options.userIds.map((id, index) => [
        {
          id,
          fullName: options.fullNames?.[index] ?? `VĐV ${index + 1}`,
          gender: options.genders?.[index] ?? null,
        },
      ]),
      'participants+rosters': [
        ...options.userIds.map((_, index) => duplicates[index] ?? []),
        options.occupancyRows ?? [],
      ],
    };
  }

  function createPairsRepository(tx: unknown): TournamentImportRepository {
    return createRepository(tx, {
      resolveDivisionEntryFee: jest.fn().mockResolvedValue(150000),
    }) as unknown as TournamentImportRepository;
  }

  it('creates two COMPLETE pairs from four users with the organizer fee waived', async () => {
    const userIds = ['user-1', 'user-2', 'user-3', 'user-4'];
    const harness = createHarness(addAthletePairsQueues({ userIds }));

    const result = await createPairsRepository(harness.tx).addAthletePairs(
      'tournament-1',
      'organizer-1',
      pairsDto(userIds),
    );

    expect(result.pairs).toEqual([
      expect.objectContaining({
        teamStatus: 'COMPLETE',
        userIds: ['user-1', 'user-2'],
      }),
      expect.objectContaining({
        teamStatus: 'COMPLETE',
        userIds: ['user-3', 'user-4'],
      }),
    ]);
    const participants = harness.inserts
      .filter((row) => row.table === 'participants')
      .map((row) => row.values);
    expect(participants).toEqual([
      expect.objectContaining({
        teamStatus: 'COMPLETE',
        organizerWaivedFee: true,
        pairingSource: 'MANUAL',
        entryFeeAtRegistration: '150000.00',
      }),
      expect.objectContaining({
        teamStatus: 'COMPLETE',
        organizerWaivedFee: true,
        pairingSource: 'MANUAL',
        entryFeeAtRegistration: '150000.00',
      }),
    ]);
    const rosters = harness.inserts
      .filter((row) => row.table === 'rosters')
      .map((row) => [row.values.userId, row.values.role]);
    expect(rosters).toEqual(userIds.map((id) => [id, 'MAIN']));

    // Every added account is handed back with the roster it must confirm, so none is left unasked.
    expect(result.linkedAccountNotifications).toEqual(
      userIds.map((userId) => ({
        rosterId: expect.any(String),
        userId,
        status: 'COMPLETE',
        divisionId: 'division-1',
      })),
    );
    expect(
      new Set(result.linkedAccountNotifications.map((row) => row.rosterId)).size,
    ).toBe(userIds.length);
  });

  it('cuts a generated pair team name to the 255-character column limit', async () => {
    const userIds = ['user-1', 'user-2'];
    const harness = createHarness(
      addAthletePairsQueues({
        userIds,
        fullNames: ['A'.repeat(200), 'B'.repeat(200)],
      }),
    );

    await createPairsRepository(harness.tx).addAthletePairs(
      'tournament-1',
      'organizer-1',
      pairsDto(userIds),
    );

    const [participant] = harness.inserts.filter((row) => row.table === 'participants');
    expect(participant?.values.teamName).toBe(`${'A'.repeat(200)} / ${'B'.repeat(52)}`);
  });

  it('leaves an unpaired trailing athlete as PENDING_PARTNER with no fee', async () => {
    const userIds = ['user-1', 'user-2', 'user-3'];
    const harness = createHarness(addAthletePairsQueues({ userIds }));

    const result = await createPairsRepository(harness.tx).addAthletePairs(
      'tournament-1',
      'organizer-1',
      pairsDto(userIds),
    );

    expect(
      result.pairs.map((pair) => [pair.teamStatus, pair.userIds]),
    ).toEqual([
      ['COMPLETE', ['user-1', 'user-2']],
      ['PENDING_PARTNER', ['user-3']],
    ]);
    const participants = harness.inserts
      .filter((row) => row.table === 'participants')
      .map((row) => row.values);
    expect(participants.map((values) => values.teamStatus)).toEqual([
      'COMPLETE',
      'PENDING_PARTNER',
    ]);
    expect(
      participants.every((values) => values.organizerWaivedFee === true),
    ).toBe(true);
  });

  it('rejects a division that is not a doubles format', async () => {
    const userIds = ['user-1', 'user-2'];
    const harness = createHarness(
      addAthletePairsQueues({ userIds, matchType: 'SINGLES' }),
    );

    await expect(
      createPairsRepository(harness.tx).addAthletePairs(
        'tournament-1',
        'organizer-1',
        pairsDto(userIds),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.inserts).toHaveLength(0);
  });

  it('rejects a team-sport division', async () => {
    const userIds = ['user-1', 'user-2'];
    const harness = createHarness(
      addAthletePairsQueues({
        userIds,
        tournamentConfig: { teamSize: 11, minTeamSize: 7 },
      }),
    );

    await expect(
      createPairsRepository(harness.tx).addAthletePairs(
        'tournament-1',
        'organizer-1',
        pairsDto(userIds),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.inserts).toHaveLength(0);
  });

  it.each([
    ['two athletes of the same gender', ['MALE', 'MALE']],
    ['an athlete with no gender on file', ['MALE', null]],
  ] as const)(
    'creates a MIXED_DOUBLES pair from %s: organizer pairing never checks gender',
    async (_label, genders) => {
      const userIds = ['user-1', 'user-2'];
      const harness = createHarness(
        addAthletePairsQueues({
          userIds,
          matchType: 'MIXED_DOUBLES',
          genderRestriction: 'MIXED',
          genders: [...genders],
        }),
      );

      const result = await createPairsRepository(harness.tx).addAthletePairs(
        'tournament-1',
        'organizer-1',
        pairsDto(userIds),
      );

      expect(result.pairs).toEqual([
        expect.objectContaining({
          teamStatus: 'COMPLETE',
          userIds: ['user-1', 'user-2'],
        }),
      ]);
    },
  );

  it('rejects the whole batch when a later athlete already has an active roster', async () => {
    const userIds = ['user-1', 'user-2', 'user-3', 'user-4'];
    const harness = createHarness(
      addAthletePairsQueues({
        userIds,
        duplicateRows: [[], [{ id: 'roster-9' }]],
      }),
    );

    await expect(
      createPairsRepository(harness.tx).addAthletePairs(
        'tournament-1',
        'organizer-1',
        pairsDto(userIds),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.inserts).toHaveLength(0);
  });

  it('rejects the batch when an athlete is no longer a friend of the organizer', async () => {
    const userIds = ['user-1', 'user-2'];
    const harness = createHarness(
      addAthletePairsQueues({ userIds, relationRows: [] }),
    );

    await expect(
      createPairsRepository(harness.tx).addAthletePairs(
        'tournament-1',
        'organizer-1',
        pairsDto(userIds),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.inserts).toHaveLength(0);
  });

  it('rejects a pair batch that needs more team slots than the locked division has', async () => {
    const userIds = ['user-1', 'user-2'];
    const harness = createHarness(
      addAthletePairsQueues({
        userIds,
        divisionLimit: 1,
        occupancyRows: [
          {
            teamStatus: 'PENDING_APPROVAL',
            rosterMemberCount: 1,
            tournamentId: 'tournament-1',
            divisionId: 'division-1',
          },
        ],
      }),
    );

    await expect(
      createPairsRepository(harness.tx).addAthletePairs(
        'tournament-1',
        'organizer-1',
        pairsDto(userIds),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.inserts).toHaveLength(0);
  });

  it('rejects the batch when registration is locked for the tournament', async () => {
    const userIds = ['user-1', 'user-2'];
    const harness = createHarness(
      addAthletePairsQueues({ userIds, isRegistrationLocked: true }),
    );

    await expect(
      createPairsRepository(harness.tx).addAthletePairs(
        'tournament-1',
        'organizer-1',
        pairsDto(userIds),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(harness.inserts).toHaveLength(0);
  });
});

describe('TournamentImportRepository.roster batch account name and identity', () => {
  const tournament = {
    id: 'tournament-1',
    matchType: 'SINGLES',
    maxParticipants: null,
    tournamentConfig: null,
    entryFee: 0,
  };
  const divisions = [
    {
      id: 'division-1',
      tournamentId: 'tournament-1',
      name: 'Singles A',
      matchType: 'SINGLES',
      maxParticipants: 4,
      tournamentConfig: null,
    },
    {
      id: 'division-2',
      tournamentId: 'tournament-1',
      name: 'Singles B',
      matchType: 'SINGLES',
      maxParticipants: 4,
      tournamentConfig: null,
    },
  ];
  const makeBatch = (participant: Record<string, unknown>, divisionId = 'division-1') =>
    Object.assign(new RosterImportBatchDto(), {
      groups: [{ divisionId, participants: [participant] }],
    });
  const makeQueues = (overrides: Record<string, Row[][]> = {}) => ({
    rosterBatches: [[]],
    tournaments: [[tournament]],
    divisions: [divisions],
    'participants+rosters': [[], []],
    'divisions+tournaments': [divisions],
    'profiles+users': [
      [{ id: 'linked-user', email: 'linked@example.test', fullName: 'Nguyễn Linked' }],
    ],
    ...overrides,
  });
  const linkedParticipant = {
    teamName: 'Đội Linked',
    player1Name: '',
    player1Email: 'linked@example.test',
    source: 'EXCEL',
  };

  it('preview lets a row with a confirmed linked account omit the name', async () => {
    const harness = createHarness(makeQueues());
    const preview = await createRepository(harness.tx).previewRosterImportBatch(
      'tournament-1',
      makeBatch({ ...linkedParticipant, confirmedPlayer1UserId: 'linked-user' }),
    );

    const row = preview.groups[0].rows[0];
    expect(row.status).not.toContain('MISSING_NAME');
    expect(row.status).toContain('FOUND');
  });

  it('preview still requires a name when the email matches an account that was not confirmed', async () => {
    const harness = createHarness(makeQueues());
    const preview = await createRepository(harness.tx).previewRosterImportBatch(
      'tournament-1',
      makeBatch({ ...linkedParticipant }),
    );

    expect(preview.groups[0].rows[0].status).toContain('MISSING_NAME');
  });

  it('preview requires a name for a row with no address and no account', async () => {
    const harness = createHarness(makeQueues());
    const preview = await createRepository(harness.tx).previewRosterImportBatch(
      'tournament-1',
      makeBatch({ teamName: 'Đội Trống', player1Name: '', source: 'EXCEL' }),
    );

    expect(preview.groups[0].rows[0].status).toContain('MISSING_NAME');
  });

  it('preview flags a no-address row whose identity already exists in the same division', async () => {
    const harness = createHarness(
      makeQueues({
        participants: [
          [{ divisionId: 'division-1', teamName: 'Đội Trùng', player1Name: 'Trần Trùng' }],
        ],
      }),
    );
    const preview = await createRepository(harness.tx).previewRosterImportBatch(
      'tournament-1',
      makeBatch({
        teamName: 'Đội Trùng',
        player1Name: 'Trần Trùng',
        source: 'EXCEL',
      }),
    );

    expect(preview.groups[0].rows[0].status).toContain('DUPLICATE_IN_TOURNAMENT');
  });

  it('preview does not treat the same identity in another division as a duplicate', async () => {
    const harness = createHarness(
      makeQueues({
        participants: [
          [{ divisionId: 'division-1', teamName: 'Đội Trùng', player1Name: 'Trần Trùng' }],
        ],
      }),
    );
    const preview = await createRepository(harness.tx).previewRosterImportBatch(
      'tournament-1',
      makeBatch(
        { teamName: 'Đội Trùng', player1Name: 'Trần Trùng', source: 'EXCEL' },
        'division-2',
      ),
    );

    expect(preview.groups[0].rows[0].status).not.toContain('DUPLICATE_IN_TOURNAMENT');
  });

  it('preview flags a named row against an entry of the same team stored without a name', async () => {
    const harness = createHarness(
      makeQueues({
        participants: [[{ divisionId: 'division-1', teamName: 'Đội Trùng', player1Name: null }]],
      }),
    );
    const preview = await createRepository(harness.tx).previewRosterImportBatch(
      'tournament-1',
      makeBatch({ teamName: 'Đội Trùng', player1Name: 'Trần Mới', source: 'EXCEL' }),
    );

    expect(preview.groups[0].rows[0].status).toContain('DUPLICATE_IN_TOURNAMENT');
  });

  it('commit stores the account name for a confirmed linked row with a blank name', async () => {
    const harness = createHarness(makeQueues());
    await createRepository(harness.tx).importRosterBatch(
      'tournament-1',
      'organizer-1',
      makeBatch({ ...linkedParticipant, confirmedPlayer1UserId: 'linked-user' }),
      'key-linked-name',
    );

    const participant = harness.inserts.find((insert) => insert.table === 'participants');
    expect(participant?.values.registeredBy).toBe('linked-user');
    expect(participant?.values.customResponses).toMatchObject({
      player1Name: 'Nguyễn Linked',
    });
  });

  it('commit rejects a blank-name row whose account was never confirmed and writes no participant', async () => {
    const harness = createHarness(makeQueues());

    await expect(
      createRepository(harness.tx).importRosterBatch(
        'tournament-1',
        'organizer-1',
        makeBatch({ ...linkedParticipant }),
        'key-unconfirmed-blank',
      ),
    ).rejects.toThrow('thiếu tên VĐV 1');
    expect(harness.inserts.filter((insert) => insert.table === 'participants')).toHaveLength(0);
  });
});

describe('import seeds follow the file order, never the file score', () => {
  const PAIR_THREE = {
    teamName: 'Cặp đôi thứ ba',
    player1Name: 'Nguyen Van E',
    player1Email: 'player-five@example.test',
    player2Name: 'Nguyen Van F',
    player2Email: 'player-six@example.test',
    autoApprove: true,
    source: 'GOOGLE_FORM' as const,
  };

  it('seeds an empty division 1..N in row order and takes the seeding lock', async () => {
    const harness = createHarness(divisionImportQueues({ entries: [] }));

    await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [PAIR, PAIR_TWO, PAIR_THREE],
      'division-1',
    );

    const participants = harness.inserts
      .filter((insert) => insert.table === 'participants')
      .map((insert) => insert.values);
    expect(participants.map((row) => row.teamName)).toEqual([
      PAIR.teamName,
      PAIR_TWO.teamName,
      PAIR_THREE.teamName,
    ]);
    expect(participants.map((row) => row.seed)).toEqual([1, 2, 3]);
    expect(
      harness.executed.map((query) => dialect.sqlToQuery(query as SQL).params),
    ).toContainEqual(['tournament-seeding:tournament-1']);
  });

  it('continues after the highest seed the division already holds', async () => {
    const harness = createHarness({
      ...divisionImportQueues({ entries: [] }),
      participants: [[{ maxSeed: 8 }]],
    });

    await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [PAIR, PAIR_TWO],
      'division-1',
    );

    const participants = harness.inserts
      .filter((insert) => insert.table === 'participants')
      .map((insert) => insert.values);
    expect(participants.map((row) => row.seed)).toEqual([9, 10]);
  });

  it('keeps a row score in customResponses.importedElo and never as the seed', async () => {
    const harness = createHarness(divisionImportQueues({ entries: [] }));

    await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [{ ...PAIR, elo: 1200 }],
      'division-1',
    );

    const [participant] = harness.inserts
      .filter((insert) => insert.table === 'participants')
      .map((insert) => insert.values);
    expect(participant?.seed).toBe(1);
    expect(participant?.customResponses).toMatchObject({ importedElo: 1200 });
  });

  it('writes no importedElo for a row without a score, even when a form answer claims one', async () => {
    const harness = createHarness(divisionImportQueues({ entries: [] }));

    await createRepository(harness.tx).importRosterRows(
      'tournament-1',
      'organizer-1',
      [{ ...PAIR, customResponses: { importedElo: 999 } }],
      'division-1',
    );

    const [participant] = harness.inserts
      .filter((insert) => insert.table === 'participants')
      .map((insert) => insert.values);
    expect(participant?.seed).toBe(1);
    expect(participant?.customResponses).not.toHaveProperty('importedElo');
  });
});
