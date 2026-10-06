import { BadRequestException } from '@nestjs/common';
import * as schema from '../../../database/schema';
import { TournamentImportRepository } from './tournament-import.repository';

/**
 * The current participant-import row contract.
 *
 * Two rules are pinned here:
 *
 * - An email only ever resolves to an account that already exists. A matched
 *   address links that one account; an unmatched address stays contact metadata
 *   on the participant row and must not become a synthetic user, a roster
 *   member, or a notification recipient.
 * - The one/doubles row rules the add-athlete form depends on are enforced
 *   before any row is written, so a malformed or half-filled row leaves the
 *   tournament untouched.
 *
 * Capacity limits are deliberately left generous — the user-owned capacity lock
 * and the weighted singles/doubles slot policy are already defended by
 * `tournament-import-capacity.spec.ts` and are not re-tested here.
 */

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

type Insert = { table: string; values: Row };

/**
 * Scripted transaction double.
 *
 * `reads` maps a joined-table key to the rows each successive lookup on that
 * scope returns; the final entry repeats, so a query issued more than once for
 * the same scope keeps answering with the same answer. `users` is the account
 * directory: each queued entry is the account an email/phone lookup finds, and
 * an empty entry models "no such account". No scope can insert a user — a
 * synthetic account would be recorded as an insert and fail the assertions.
 */
function createHarness(reads: Record<string, Row[][]>, users: Row[][]) {
  const inserts: Insert[] = [];
  const scopes: Record<string, Row[][]> = { ...reads, users };

  const takeRows = (key: string): Row[] => {
    const queue = scopes[key];
    if (!queue || queue.length === 0) return [];
    return queue.length === 1 ? queue[0] : queue.shift()!;
  };

  const tableKey = (tables: string[]): string =>
    [...new Set(tables)].sort().join('+');

  // Occupancy rows are projected onto the columns the capacity query asked for,
  // exactly as the real grouped join would return them.
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

const LINKED_EMAIL = 'athlete.linked@example.test';
const SECOND_LINKED_EMAIL = 'athlete.linked.2@example.test';
const UNKNOWN_CONTACT_EMAIL = 'athlete.unknown@example.test';

const LINKED_ACCOUNT: Row = {
  id: 'user-linked',
  email: LINKED_EMAIL,
  fullName: 'Nguyen Van A',
};

const SECOND_LINKED_ACCOUNT: Row = {
  id: 'user-linked-2',
  email: SECOND_LINKED_EMAIL,
  fullName: 'Nguyen Van B',
};

/** Reads for one division-scoped import. `users` is scripted per test. */
function importScopes(matchType: 'SINGLES' | 'DOUBLES') {
  return {
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
  };
}

const insertsOf = (inserts: Insert[], table: string) =>
  inserts.filter((insert) => insert.table === table);

const rosterUserIds = (inserts: Insert[]) =>
  insertsOf(inserts, 'rosters').map((insert) => insert.values.userId);

describe('importing a participant by email links only an existing account', () => {
  it('adds the matched account to the roster and creates no other account', async () => {
    const harness = createHarness(importScopes('SINGLES'), [[LINKED_ACCOUNT]]);

    const result = await createRepository(harness.tx).importRosterRows(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'Nguyen Van A',
          player1Name: 'Nguyen Van A',
          player1Email: LINKED_EMAIL,
          autoApprove: true,
          source: 'MANUAL_EMAIL',
        },
      ],
      DIVISION_ID,
    );

    expect(result.importedCount).toBe(1);
    // Exactly one roster membership, and it is the account the email resolved
    // to — not the importing manager and not a freshly minted user.
    expect(insertsOf(harness.inserts, 'rosters')).toEqual([
      {
        table: 'rosters',
        values: expect.objectContaining({
          userId: 'user-linked',
          role: 'MAIN',
        }),
      },
    ]);
    expect(insertsOf(harness.inserts, 'users')).toEqual([]);

    const [participant] = insertsOf(harness.inserts, 'participants');
    expect(participant.values.registeredBy).toBe('user-linked');
    expect(participant.values.partnerUserId).toBeNull();
    expect(participant.values.customResponses).toMatchObject({
      player1Email: LINKED_EMAIL,
    });
  });

  it('notifies the matched account once, with the row it landed in', async () => {
    const harness = createHarness(importScopes('SINGLES'), [[LINKED_ACCOUNT]]);

    const result = await createRepository(harness.tx).importRosterRows(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'Nguyen Van A',
          player1Name: 'Nguyen Van A',
          player1Email: LINKED_EMAIL,
          autoApprove: true,
          source: 'MANUAL_EMAIL',
        },
      ],
      DIVISION_ID,
    );

    expect(result.linkedAccountNotifications).toEqual([
      {
        rosterId: expect.any(String),
        userId: 'user-linked',
        status: 'COMPLETE',
        divisionId: DIVISION_ID,
      },
    ]);
  });

  it('keeps an unmatched email as contact metadata without a user, roster row or notification', async () => {
    const harness = createHarness(importScopes('SINGLES'), [[]]);

    const result = await createRepository(harness.tx).importRosterRows(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'VĐV Chưa Có Tài Khoản',
          player1Name: 'VĐV Chưa Có Tài Khoản',
          player1Email: UNKNOWN_CONTACT_EMAIL,
          isPaid: false,
          autoApprove: true,
          source: 'MANUAL_EMAIL',
        },
      ],
      DIVISION_ID,
    );

    // The registration itself still succeeds: the contact is saved.
    expect(result.importedCount).toBe(1);
    expect(insertsOf(harness.inserts, 'participants')).toHaveLength(1);
    expect(insertsOf(harness.inserts, 'rosters')).toEqual([]);
    expect(insertsOf(harness.inserts, 'users')).toEqual([]);
    // Nothing is queued for a notification, so an unmatched contact can never
    // become a recipient.
    expect(result.linkedAccountNotifications).toEqual([]);

    const [participant] = insertsOf(harness.inserts, 'participants');
    // Without a linked account the importing manager owns the registration, so
    // an unmatched contact never borrows another athlete's identity.
    expect(participant.values.registeredBy).toBe(MANAGER_ID);
    expect(participant.values.isPaid).toBe(false);
    expect(participant.values.teamStatus).toBe('PENDING_APPROVAL');
    expect(participant.values.customResponses).toMatchObject({
      player1Email: UNKNOWN_CONTACT_EMAIL,
    });
  });

  it('links only the matched athlete of a doubles row and keeps the other contact', async () => {
    const harness = createHarness(importScopes('DOUBLES'), [[LINKED_ACCOUNT]]);

    const result = await createRepository(harness.tx).importRosterRows(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'Cặp đôi kiểm thử',
          player1Name: 'Nguyen Van A',
          player1Email: LINKED_EMAIL,
          player2Name: 'VĐV Chưa Có Tài Khoản',
          player2Email: UNKNOWN_CONTACT_EMAIL,
          autoApprove: true,
          source: 'MANUAL_EMAIL',
        },
      ],
      DIVISION_ID,
    );

    expect(rosterUserIds(harness.inserts)).toEqual(['user-linked']);
    const [participant] = insertsOf(harness.inserts, 'participants');
    expect(participant.values.partnerUserId).toBeNull();
    expect(participant.values.customResponses).toMatchObject({
      player1Email: LINKED_EMAIL,
      player2Name: 'VĐV Chưa Có Tài Khoản',
      player2Email: UNKNOWN_CONTACT_EMAIL,
    });
    // The unlinked partner is not a notification recipient either.
    expect(result.linkedAccountNotifications).toEqual([
      {
        rosterId: expect.any(String),
        userId: 'user-linked',
        status: 'COMPLETE',
        divisionId: DIVISION_ID,
      },
    ]);
  });

  it('gives each matched doubles athlete their own roster row and notification', async () => {
    const harness = createHarness(importScopes('DOUBLES'), [
      [LINKED_ACCOUNT, SECOND_LINKED_ACCOUNT],
    ]);

    const result = await createRepository(harness.tx).importRosterRows(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'Cặp đôi đã có tài khoản',
          player1Name: 'Nguyen Van A',
          player1Email: LINKED_EMAIL,
          player2Name: 'Nguyen Van B',
          player2Email: SECOND_LINKED_EMAIL,
          autoApprove: true,
          source: 'MANUAL_EMAIL',
        },
      ],
      DIVISION_ID,
    );

    expect(rosterUserIds(harness.inserts)).toEqual([
      'user-linked',
      'user-linked-2',
    ]);
    expect(insertsOf(harness.inserts, 'users')).toEqual([]);
    expect(
      result.linkedAccountNotifications?.map((entry) => entry.userId).sort(),
    ).toEqual(['user-linked', 'user-linked-2']);
  });

  it('resolves rows independently so one unmatched contact does not hide a matched account', async () => {
    const harness = createHarness(importScopes('SINGLES'), [[LINKED_ACCOUNT]]);

    const result = await createRepository(harness.tx).importRosterRows(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'VĐV Chưa Có Tài Khoản',
          player1Name: 'VĐV Chưa Có Tài Khoản',
          player1Email: UNKNOWN_CONTACT_EMAIL,
          autoApprove: true,
          source: 'MANUAL_EMAIL',
        },
        {
          teamName: 'Nguyen Van A',
          player1Name: 'Nguyen Van A',
          player1Email: LINKED_EMAIL,
          autoApprove: true,
          source: 'MANUAL_EMAIL',
        },
      ],
      DIVISION_ID,
    );

    expect(result.importedCount).toBe(2);
    expect(rosterUserIds(harness.inserts)).toEqual(['user-linked']);
    expect(insertsOf(harness.inserts, 'users')).toEqual([]);
    expect(result.linkedAccountNotifications).toEqual([
      {
        rosterId: expect.any(String),
        userId: 'user-linked',
        status: 'COMPLETE',
        divisionId: DIVISION_ID,
      },
    ]);
  });

  it('does not link by phone when the imported email is unmatched', async () => {
    const harness = createHarness(importScopes('SINGLES'), [[]]);

    const result = await createRepository(harness.tx).importRosterRows(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'Liên hệ không xác định',
          player1Name: 'Liên hệ không xác định',
          player1Email: UNKNOWN_CONTACT_EMAIL,
          player1Phone: '0900000000',
          autoApprove: true,
          source: 'MANUAL_EMAIL',
        },
      ],
      DIVISION_ID,
    );

    expect(result.importedCount).toBe(1);
    expect(insertsOf(harness.inserts, 'rosters')).toEqual([]);
    expect(insertsOf(harness.inserts, 'users')).toEqual([]);
    expect(result.linkedAccountNotifications).toEqual([]);
  });
});

describe('import rows follow the current one/doubles contract', () => {
  it('rejects a singles row that carries a second athlete before writing anything', async () => {
    const harness = createHarness(importScopes('SINGLES'), []);

    await expect(
      createRepository(harness.tx).importRosterRows(
        TOURNAMENT_ID,
        MANAGER_ID,
        [
          {
            teamName: 'Dòng lỗi',
            player1Name: 'Nguyen Van A',
            player1Email: LINKED_EMAIL,
            player2Name: 'Nguyen Van B',
            autoApprove: true,
            source: 'MANUAL_EMAIL',
          },
        ],
        DIVISION_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.inserts).toEqual([]);
  });

  it('accepts a doubles row containing only the first athlete', async () => {
    const harness = createHarness(importScopes('DOUBLES'), []);

    const result = await createRepository(harness.tx).importRosterRows(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'Nguyen Van A',
          player1Name: 'Nguyen Van A',
          player1Email: LINKED_EMAIL,
          autoApprove: true,
          source: 'MANUAL_EMAIL',
        },
      ],
      DIVISION_ID,
    );

    expect(result.importedCount).toBe(1);
    expect(insertsOf(harness.inserts, 'participants')).toHaveLength(1);
    expect(insertsOf(harness.inserts, 'rosters')).toEqual([]);
  });

  it('imports a named doubles partner without an email instead of refusing it', async () => {
    const harness = createHarness(importScopes('DOUBLES'), []);

    // The partner simply has no account yet. Refusing the row meant organizers
    // could not enter an athlete whose fee they had already collected.
    await createRepository(harness.tx).importRosterRows(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'Cặp đôi thiếu email',
          player1Name: 'Nguyen Van A',
          player1Email: LINKED_EMAIL,
          player2Name: 'Nguyen Van B',
          autoApprove: true,
          source: 'MANUAL_EMAIL',
        },
      ],
      DIVISION_ID,
    );

    // One participant row: an unlinked partner has no user to create, so the
    // name is kept on the row instead of becoming a second participant.
    expect(insertsOf(harness.inserts, 'participants')).toHaveLength(1);
  });
});

describe('wildcard requests stay annotations', () => {
  it('records the request as metadata without granting a wildcard slot', async () => {
    const harness = createHarness(importScopes('SINGLES'), [[]]);

    await createRepository(harness.tx).importRosterRows(
      TOURNAMENT_ID,
      MANAGER_ID,
      [
        {
          teamName: 'VĐV đặc cách',
          player1Name: 'VĐV đặc cách',
          player1Email: UNKNOWN_CONTACT_EMAIL,
          source: 'EXCEL',
          entryType: 'WILD_CARD_REQUEST',
          customResponses: {
            importedFrom: 'MANUAL_EMAIL',
            is_wildcard: true,
            note: 'khách quen',
          },
        },
      ],
      DIVISION_ID,
    );

    const [participant] = insertsOf(harness.inserts, 'participants');
    expect(participant.values.customResponses).toEqual({
      note: 'khách quen',
      importedFrom: 'EXCEL',
      player1Email: UNKNOWN_CONTACT_EMAIL,
      entryType: 'WILD_CARD_REQUEST',
    });
    expect(participant.values.isWildcard).toBeUndefined();
    expect(participant.values.isMock).toBeUndefined();
    expect(participant.values.teamStatus).toBe('PENDING_APPROVAL');
  });
});

describe('import contact email validation', () => {
  it('rejects a row without a first athlete name before writing anything', async () => {
    const harness = createHarness(importScopes('SINGLES'), []);

    await expect(
      createRepository(harness.tx).importRosterRows(
        TOURNAMENT_ID,
        MANAGER_ID,
        [
          {
            teamName: 'Dòng trống tên',
            player1Name: '   ',
            player1Email: 'valid@example.test',
            autoApprove: true,
            source: 'MANUAL_EMAIL',
          },
        ],
        DIVISION_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.inserts).toEqual([]);
  });

  it('rejects a malformed contact email before writing anything', async () => {
    const harness = createHarness(importScopes('SINGLES'), []);

    await expect(
      createRepository(harness.tx).importRosterRows(
        TOURNAMENT_ID,
        MANAGER_ID,
        [
          {
            teamName: 'Email sai định dạng',
            player1Name: 'Nguyen Van A',
            player1Email: 'khong-phai-email',
            autoApprove: true,
            source: 'MANUAL_EMAIL',
          },
        ],
        DIVISION_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.inserts).toEqual([]);
  });

  it('rejects a doubles pair that shares one email address', async () => {
    const harness = createHarness(importScopes('DOUBLES'), []);

    await expect(
      createRepository(harness.tx).importRosterRows(
        TOURNAMENT_ID,
        MANAGER_ID,
        [
          {
            teamName: 'Cặp đôi trùng email',
            player1Name: 'Nguyen Van A',
            player1Email: LINKED_EMAIL,
            player2Name: 'Nguyen Van B',
            player2Email: LINKED_EMAIL.toUpperCase(),
            autoApprove: true,
            source: 'MANUAL_EMAIL',
          },
        ],
        DIVISION_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.inserts).toEqual([]);
  });
});
describe('duplicate email checks for existing tournament rosters', () => {
  it('rejects an account already linked through regular registration', async () => {
    const harness = createHarness(
      {
        ...importScopes('SINGLES'),
        'participants+rosters+users': [[{ email: LINKED_EMAIL }]],
      },
      [],
    );

    await expect(
      createRepository(harness.tx).importRosterRows(
        TOURNAMENT_ID,
        MANAGER_ID,
        [
          {
            teamName: 'Existing participant',
            player1Name: 'Nguyen Van A',
            player1Email: LINKED_EMAIL,
            autoApprove: true,
            source: 'EXCEL',
          },
        ],
        DIVISION_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.inserts).toEqual([]);
  });
});
