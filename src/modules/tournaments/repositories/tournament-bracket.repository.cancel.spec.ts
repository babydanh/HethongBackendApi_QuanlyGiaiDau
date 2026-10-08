import { BadRequestException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { TournamentBracketRepository } from './tournament-bracket.repository';
import type { AuditService } from '../../audit/audit.service';
import type { SQL } from 'drizzle-orm';

type Row = Record<string, unknown>;
type SelectCall = { table?: unknown; where?: unknown; lock?: unknown };
type UpdateCall = {
  table: unknown;
  values?: Record<string, unknown>;
  where?: unknown;
};

type Fixture = {
  stages: Row[];
  matches: Row[];
  updatedMatches?: Row[];
  updatedStages?: Row[];
};
type SelectQuery = PromiseLike<Row[]> & {
  from(table: unknown): SelectQuery;
  where(where: unknown): SelectQuery;
  orderBy(...orderBy: unknown[]): SelectQuery;
  for(lock: unknown): SelectQuery;
};
type ReturningQuery = { returning(): Promise<Row[]> };
type UpdateQuery = {
  set(values: Record<string, unknown>): UpdateQuery;
  where(where: unknown): ReturningQuery;
};

function createRepository(fixture: Fixture) {
  const selectCalls: SelectCall[] = [];
  const updateCalls: UpdateCall[] = [];
  let selectIndex = 0;
  const selectRows = [fixture.stages, fixture.matches];

  const tx = {
    select: () => {
      const call: SelectCall = {};
      selectCalls.push(call);
      const rows = selectRows[selectIndex++] ?? [];
      const query: SelectQuery = {
        from: (table) => {
          call.table = table;
          return query;
        },
        where: (where) => {
          call.where = where;
          return query;
        },
        orderBy: () => query,
        for: (lock) => {
          call.lock = lock;
          return query;
        },
        then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
      };
      return query;
    },
    update: (table: unknown) => {
      const call: UpdateCall = { table };
      let update: UpdateQuery;
      update = {
        set: (values) => {
          call.values = values;
          return update;
        },
        where: (where) => {
          call.where = where;
          return {
            returning: async () => {
              updateCalls.push(call);
              return table === schema.matches
                ? (fixture.updatedMatches ?? [])
                : (fixture.updatedStages ?? []);
            },
          };
        },
      };
      return update;
    },
  };
  const db = {
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>) =>
      callback(tx),
  };

  return {
    // Only transaction/query methods are exercised; audit methods are unused.
    repository: new TournamentBracketRepository(
      db as unknown as AppDb,
      {} as unknown as AuditService,
    ),
    selectCalls,
    updateCalls,
  };
}

function compileWhere(where: unknown) {
  return new PgDialect().sqlToQuery(where as SQL);
}

describe('TournamentBracketRepository.cancelDivisionBracket', () => {
  it('soft-deletes only scheduled matches and active stages for the selected division', async () => {
    const { repository, selectCalls, updateCalls } = createRepository({
      stages: [{ id: 'stage-1' }],
      matches: [
        {
          id: 'match-1',
          status: 'SCHEDULED',
          startedAt: null,
          completedAt: null,
        },
        {
          id: 'match-2',
          status: 'PENDING',
          startedAt: null,
          completedAt: null,
        },
      ],
      updatedMatches: [{ id: 'match-1' }, { id: 'match-2' }],
      updatedStages: [{ id: 'stage-1' }],
    });

    await expect(
      repository.cancelDivisionBracket('tournament-1', 'division-1'),
    ).resolves.toEqual({ cancelledStages: 1, cancelledMatches: 2 });

    const stageSelection = compileWhere(selectCalls[0].where);
    expect(stageSelection.sql).toContain('tournament_id');
    expect(stageSelection.sql).toContain('tournament_division_id');
    expect(stageSelection.sql).toContain('deleted_at');
    expect(stageSelection.params).toEqual(
      expect.arrayContaining(['tournament-1', 'division-1']),
    );
    expect(selectCalls[0].lock).toBe('update');

    const matchSelection = compileWhere(selectCalls[1].where);
    expect(matchSelection.sql).toContain('stage_id');
    expect(matchSelection.sql).toContain('deleted_at');
    expect(matchSelection.params).toContain('stage-1');
    expect(selectCalls[1].lock).toBe('update');
    expect(updateCalls.map((call) => call.table)).toEqual([
      schema.matches,
      schema.tournamentStages,
    ]);
  });

  it.each([
    ['startedAt', { status: 'SCHEDULED', startedAt: new Date() }],
    ['completedAt', { status: 'SCHEDULED', completedAt: new Date() }],
    ['ONGOING status', { status: 'ONGOING' }],
    ['COMPLETED status', { status: 'COMPLETED' }],
  ])('rejects cancellation for a match with %s', async (_label, match) => {
    const { repository, updateCalls } = createRepository({
      stages: [{ id: 'stage-1' }],
      matches: [{ id: 'match-1', ...match }],
    });

    await expect(
      repository.cancelDivisionBracket('tournament-1', 'division-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateCalls).toHaveLength(0);
  });

  it('returns zero counts when the division has no active stage', async () => {
    const { repository, selectCalls, updateCalls } = createRepository({
      stages: [],
      matches: [],
    });

    await expect(
      repository.cancelDivisionBracket('tournament-1', 'division-1'),
    ).resolves.toEqual({ cancelledStages: 0, cancelledMatches: 0 });
    expect(selectCalls).toHaveLength(1);
    expect(updateCalls).toHaveLength(0);
  });
});
