import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as schema from '../../../database/schema';
import {
  ImportParticipantsDto,
  ParticipantImportItemDto,
} from '../dto/import-participants.dto';
import { RosterImportDto, RosterImportItemDto } from '../dto/roster-import.dto';
import { TournamentImportRepository } from './tournament-import.repository';

/**
 * The released `POST /tournaments/:id/import-participants` contract must keep
 * working: emails were optional, provenance was not declared and a row could be
 * matched by phone number. Roster import adds the stricter guarantees on a new
 * endpoint instead of tightening the old one.
 */

const TABLE_KEYS = new Map<unknown, string>([
  [schema.tournaments, 'tournaments'],
  [schema.tournamentDivisions, 'divisions'],
  [schema.tournamentParticipants, 'participants'],
  [schema.tournamentRosters, 'rosters'],
  [schema.profiles, 'profiles'],
  [schema.users, 'users'],
]);

type Row = Record<string, unknown>;
type Insert = { table: string; values: Row };

function createHarness(
  reads: Record<string, Row[][]>,
  users: Row[][],
  profiles: Row[][] = [],
) {
  const inserts: Insert[] = [];
  const scopes: Record<string, Row[][]> = { ...reads, users, profiles };

  const takeRows = (key: string): Row[] => {
    const queue = scopes[key];
    if (!queue || queue.length === 0) return [];
    return queue.length === 1 ? queue[0] : queue.shift()!;
  };

  const tableKey = (tables: string[]): string =>
    [...new Set(tables)].sort().join('+');

  const projectOccupancyRow = (
    fields: Record<string, unknown>,
    row: Row,
  ): Row => {
    const projected: Row = { rosterMemberCount: row.rosterMemberCount };
    for (const [key, column] of Object.entries(fields)) {
      if (key === 'rosterMemberCount') continue;
      if (column === schema.tournamentParticipants.tournamentDivisionId) {
        projected[key] =
          row.divisionId !== undefined ? row.divisionId : row.scopeId;
      } else if (column === schema.tournamentParticipants.tournamentId) {
        projected[key] = row.tournamentId ?? row.scopeId ?? null;
      } else {
        projected[key] = row[key];
      }
    }
    return projected;
  };

  const tx = {
    select: (fields?: Record<string, unknown>) => {
      const tables: string[] = [];
      const query: Record<string, unknown> = {};

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

const TOURNAMENT_ID = 'tournament-1';
const DIVISION_ID = 'division-1';
const MANAGER_ID = 'manager-1';

const legacyScopes = (matchType: 'SINGLES' | 'DOUBLES') => ({
  tournaments: [
    [
      {
        id: TOURNAMENT_ID,
        matchType,
        maxParticipants: 64,
        tournamentConfig: null,
        entryFee: 0,
      },
    ],
  ],
  divisions: [[{ id: DIVISION_ID, tournamentId: TOURNAMENT_ID, matchType }]],
  'divisions+tournaments': [
    [
      {
        id: DIVISION_ID,
        matchType,
        maxParticipants: 64,
        tournamentConfig: null,
      },
    ],
  ],
  'participants+rosters': [[]],
  'participants+rosters+users': [[]],
});

const insertsOf = (inserts: Insert[], table: string) =>
  inserts.filter((insert) => insert.table === table);
function collectMessages(
  errors: Awaited<ReturnType<typeof validate>>,
): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...collectMessages(error.children ?? []),
  ]);
}

async function validationErrors(
  dtoClass: typeof ImportParticipantsDto | typeof RosterImportDto,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(dtoClass, payload);
  const errors = await validate(dto as object, {
    whitelist: false,
    forbidNonWhitelisted: false,
  });
  return collectMessages(errors);
}

describe('legacy import request contract', () => {
  it('still accepts a row without an email and without a source', async () => {
    expect(
      await validationErrors(ImportParticipantsDto, {
        participants: [{ teamName: 'VĐV 1', player1Name: 'VĐV 1' }],
        sendInvitationEmail: true,
      }),
    ).toEqual([]);
  });

  it('keeps optional phone and unpaid payment fields accepted', async () => {
    const item = plainToInstance(ParticipantImportItemDto, {
      teamName: 'VĐV 1',
      player1Name: 'VĐV 1',
      player1Phone: '0900000000',
      isPaid: false,
    });

    expect(await validate(item)).toEqual([]);
  });
});

describe('strict roster request contract', () => {
  it('rejects the same legacy row because the email and source are required', async () => {
    const errors = await validationErrors(RosterImportDto, {
      participants: [{ teamName: 'VĐV 1', player1Name: 'VĐV 1' }],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('player1Email'),
        expect.stringContaining('source'),
      ]),
    );
  });

  it('accepts a declared roster row', async () => {
    expect(
      await validationErrors(RosterImportDto, {
        participants: [
          {
            teamName: 'VĐV 1',
            player1Name: 'VĐV 1',
            player1Email: 'athlete@example.test',
            source: 'EXCEL',
            entryType: 'WILD_CARD_REQUEST',
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe('legacy import keeps email-less rows importable', () => {
  it('writes the row with GOOGLE_FORM provenance and no email metadata', async () => {
    const harness = createHarness(legacyScopes('SINGLES'), [[]]);

    const result = await createRepository(harness.tx).importParticipants(
      TOURNAMENT_ID,
      MANAGER_ID,
      [{ teamName: 'VĐV không email', player1Name: 'VĐV không email' }],
      DIVISION_ID,
    );

    expect(result.importedCount).toBe(1);
    expect(result.unregisteredEmails).toEqual([]);

    const [participant] = insertsOf(harness.inserts, 'participants');
    expect(participant.values.registeredBy).toBe(MANAGER_ID);
    expect(participant.values.customResponses).toEqual({
      importedFrom: 'GOOGLE_FORM',
    });
    expect(insertsOf(harness.inserts, 'rosters')).toEqual([]);
  });

  it('keeps caller-supplied form answers untouched, as before this change', async () => {
    const harness = createHarness(legacyScopes('SINGLES'), [[]]);

    await createRepository(harness.tx).importParticipants(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'Google Form',
          player1Name: 'Google Form',
          player1Email: 'form.athlete@example.test',
          customResponses: {
            shirtSize: 'L',
            importedFrom: 'CALLER_VALUE',
            player2Name: 'Tên do form gửi',
          },
        },
      ],
      DIVISION_ID,
    );

    const [participant] = insertsOf(harness.inserts, 'participants');
    // The importer's own facts win, but every other form answer is untouched —
    // exactly the merge order the released endpoint has always used.
    expect(participant.values.customResponses).toEqual({
      shirtSize: 'L',
      player2Name: 'Tên do form gửi',
      importedFrom: 'GOOGLE_FORM',
      player1Email: 'form.athlete@example.test',
    });
  });

  it('still matches an account by phone number only', async () => {
    const harness = createHarness(
      legacyScopes('SINGLES'),
      [[{ id: 'user-by-phone', email: 'athlete@example.test' }]],
      [[{ userId: 'user-by-phone', phoneNumber: '0900000000' }]],
    );

    await createRepository(harness.tx).importParticipants(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'VĐV theo SĐT',
          player1Name: 'VĐV theo SĐT',
          player1Phone: '0900000000',
        },
      ],
      DIVISION_ID,
    );

    const [participant] = insertsOf(harness.inserts, 'participants');
    expect(participant.values.registeredBy).toBe('user-by-phone');
    expect(insertsOf(harness.inserts, 'rosters')).toEqual([
      {
        table: 'rosters',
        values: expect.objectContaining({ userId: 'user-by-phone' }),
      },
    ]);
  });

  it('still rejects a doubles row that names no second athlete', async () => {
    const harness = createHarness(legacyScopes('DOUBLES'), [[]]);

    await expect(
      createRepository(harness.tx).importParticipants(
        TOURNAMENT_ID,
        MANAGER_ID,
        [{ teamName: 'Cặp thiếu VĐV 2', player1Name: 'VĐV 1' }],
        DIVISION_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(insertsOf(harness.inserts, 'participants')).toEqual([]);
  });
});
