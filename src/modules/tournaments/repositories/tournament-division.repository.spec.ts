import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../../../database/schema';
import { CreateDivisionDto, GenderRestriction, MatchType } from '../dto/create-division.dto';
import { UpdateDivisionDto } from '../dto/update-division.dto';
import { TournamentDivisionRepository } from './tournament-division.repository';

type Row = Record<string, unknown>;

const dialect = new PgDialect();

/**
 * A row matches when every bound parameter of the condition is one of its
 * values. Fixtures use unique ids, so `eq(id, x)` picks exactly one row and
 * `eq(tournamentId, x)` picks the tournament's divisions.
 */
function matches(row: Row, condition: SQL | undefined): boolean {
  if (!condition) return true;
  const values = Object.values(row);
  return dialect.sqlToQuery(condition).params.every((param) => values.includes(param));
}

function makeDb(tournaments: Row[], divisions: Row[]) {
  const tables = new Map<unknown, Row[]>([
    [schema.tournaments, tournaments],
    [schema.tournamentDivisions, divisions],
  ]);
  const rowsOf = (table: unknown): Row[] => {
    const rows = tables.get(table);
    if (!rows) throw new Error('fake db: unknown table');
    return rows;
  };

  const selectFrom = (table: unknown) => {
    let condition: SQL | undefined;
    const builder = {
      where(next: SQL) {
        condition = next;
        return builder;
      },
      for() {
        return builder;
      },
      limit() {
        return builder;
      },
      then(onFulfilled?: ((value: Row[]) => unknown) | null, onRejected?: ((reason: unknown) => unknown) | null) {
        const found = rowsOf(table)
          .filter((row) => matches(row, condition))
          .map((row) => ({ ...row }));
        return Promise.resolve(found).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };

  const tx = {
    select: () => ({ from: (table: unknown) => selectFrom(table) }),
    insert: (table: unknown) => {
      let inserted: Row = {};
      const builder = {
        values(next: Row) {
          inserted = { id: 'division-created', ...next };
          return builder;
        },
        returning() {
          rowsOf(table).push(inserted);
          return Promise.resolve([inserted]);
        },
      };
      return builder;
    },
    update: (table: unknown) => {
      let patch: Row = {};
      let condition: SQL | undefined;
      const builder = {
        set(next: Row) {
          patch = next;
          return builder;
        },
        where(next: SQL) {
          condition = next;
          return builder;
        },
        returning() {
          const updated: Row[] = [];
          for (const row of rowsOf(table)) {
            if (matches(row, condition)) {
              Object.assign(row, patch);
              updated.push({ ...row });
            }
          }
          return Promise.resolve(updated);
        },
      };
      return builder;
    },
  };

  return {
    transaction: (callback: (t: typeof tx) => Promise<unknown>) => callback(tx),
  };
}

function division(id: string, overrides: Row): Row {
  return {
    id,
    tournamentId: 'tournament-1',
    name: 'Nội dung',
    matchType: 'DOUBLES',
    genderRestriction: null,
    maxParticipants: null,
    entryFee: null,
    entryFeeOverrideEnabled: false,
    isConfigOverride: false,
    venueId: null,
    bracketType: null,
    roundConfig: null,
    startDate: null,
    registrationEndDate: null,
    minElo: null,
    maxElo: null,
    prizeDescription: null,
    status: 'DRAFT',
    ...overrides,
  };
}

function liteTournament(overrides: Row): Row {
  return {
    id: 'tournament-1',
    status: 'REGISTRATION_OPEN',
    isRegistrationLocked: false,
    tournamentConfig: { mode: 'LITE' },
    ...overrides,
  };
}

function makeRepository(tournaments: Row[], divisions: Row[]) {
  const auditService = {
    logCreate: jest.fn().mockResolvedValue(undefined),
    logUpdate: jest.fn().mockResolvedValue(undefined),
  };
  const paymentRepository = { assertEntryFeeChangeAllowed: jest.fn().mockResolvedValue(undefined) };
  return new TournamentDivisionRepository(
    makeDb(tournaments, divisions) as never,
    auditService as never,
    paymentRepository as never,
  );
}

describe('TournamentDivisionRepository lite tournament sync (TC-BTCPAIR-17)', () => {
  it('TC-BTCPAIR-17 moves a lite tournament to DOUBLES when one of two singles divisions becomes doubles', async () => {
    const tournaments = [liteTournament({ matchType: 'SINGLES', genderRestriction: null })];
    const divisions = [
      division('division-1', { name: 'Đơn linh hoạt', matchType: 'SINGLES' }),
      division('division-2', { name: 'Đơn Nam', matchType: 'SINGLES', genderRestriction: 'MALE' }),
    ];
    const repository = makeRepository(tournaments, divisions);

    await repository.updateDivision(
      'division-1',
      Object.assign(new UpdateDivisionDto(), {
        matchType: MatchType.DOUBLES,
        genderRestriction: null,
      }),
      'owner-1',
    );

    expect(tournaments[0]).toMatchObject({ matchType: 'DOUBLES', genderRestriction: null });
  });

  it('TC-BTCPAIR-17 syncs the gender restriction of a single-division lite tournament without hideAdvancedSettings', async () => {
    const tournaments = [liteTournament({ matchType: 'DOUBLES', genderRestriction: null })];
    const divisions = [division('division-1', { name: 'Đôi linh hoạt', matchType: 'DOUBLES' })];
    const repository = makeRepository(tournaments, divisions);

    await repository.updateDivision(
      'division-1',
      Object.assign(new UpdateDivisionDto(), { genderRestriction: GenderRestriction.FEMALE }),
      'owner-1',
    );

    expect(tournaments[0]).toMatchObject({ matchType: 'DOUBLES', genderRestriction: 'FEMALE' });
  });

  it('TC-BTCPAIR-17 syncs a lite tournament when a division is created', async () => {
    const tournaments = [liteTournament({ matchType: 'SINGLES', genderRestriction: 'MALE' })];
    const divisions = [
      division('division-1', { name: 'Đơn Nam', matchType: 'SINGLES', genderRestriction: 'MALE' }),
    ];
    const repository = makeRepository(tournaments, divisions);

    await repository.createDivision(
      {
        ...Object.assign(new CreateDivisionDto(), {
          name: 'Đôi Nữ',
          matchType: MatchType.DOUBLES,
          genderRestriction: GenderRestriction.FEMALE,
        }),
        tournamentId: 'tournament-1',
      },
      'owner-1',
    );

    expect(tournaments[0]).toMatchObject({ matchType: 'DOUBLES', genderRestriction: null });
  });

  it('TC-BTCPAIR-17 leaves the match type of a non-lite tournament alone', async () => {
    const tournaments = [
      liteTournament({ matchType: 'SINGLES', genderRestriction: null, tournamentConfig: {} }),
    ];
    const divisions = [division('division-1', { name: 'Đôi', matchType: 'DOUBLES' })];
    const repository = makeRepository(tournaments, divisions);

    await repository.updateDivision(
      'division-1',
      Object.assign(new UpdateDivisionDto(), { matchType: MatchType.DOUBLES }),
      'owner-1',
    );

    expect(tournaments[0]).toMatchObject({ matchType: 'SINGLES', genderRestriction: null });
  });
});
