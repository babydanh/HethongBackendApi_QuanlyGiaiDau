import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { AppDb } from '../../database/db.types';
import type { AuditService } from '../audit/audit.service';
import { MatchesRepository } from './matches.repository';
import type { CourtState } from './utils/court-state/court-state.utils';

const dialect = new PgDialect();

const storedCourtState: CourtState = {
  version: 1,
  startingRight: { team1: 0, team2: 1 },
  endsOverride: null,
  autoSwitchEnds: true,
  midSetSwitchDone: false,
  serverOverride: null,
  turnStart: null,
  history: [],
  updatedAt: '2026-10-14T10:00:00.000Z',
  updatedBy: 'referee-1',
};

const storedRow = {
  id: 'match-1',
  status: 'ONGOING',
  revision: 4,
  isBye: false,
  winnerId: null,
  p1SetsWon: 1,
  p2SetsWon: 0,
  scheduledAt: null,
  startedAt: null,
  scoreDetails: {
    sets: [{ team1Score: 11, team2Score: 7, isFinished: true }],
    courtState: storedCourtState,
  },
};

interface CapturedUpdate {
  set?: Record<string, unknown>;
  where?: SQL;
}

interface CompleteMatchInTxAccess {
  completeMatchInTx(
    tx: unknown,
    id: string,
    winnerId: string | null,
    details: {
      p1SetsWon: number;
      p2SetsWon: number;
      scoreDetails: Record<string, unknown> | null | undefined;
    },
  ): Promise<unknown>;
}

/** Chuỗi update giả: ghi lại `.set()` và `.where()`; `.returning()` trả về `rows`. */
function updateChain(rows: unknown[], captured: CapturedUpdate) {
  return {
    set: (values: Record<string, unknown>) => {
      captured.set = values;
      return {
        where: (condition: SQL) => {
          captured.where = condition;
          return { returning: () => Promise.resolve(rows) };
        },
      };
    },
  };
}

/** Chuỗi select giả: `.from().where().limit()` trả về `rows`. */
function selectChain(rows: unknown[]) {
  return {
    from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
  };
}

function renderScoreDetails(captured: CapturedUpdate) {
  return dialect.sqlToQuery(captured.set?.scoreDetails as SQL);
}

function buildRepository(db: unknown) {
  return new MatchesRepository(
    db as AppDb,
    { logUpdate: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService,
  );
}

describe('MatchesRepository court-state and score writes', () => {
  it('updateCourtState writes only the courtState key via jsonb_set in one UPDATE', async () => {
    const captured: CapturedUpdate = {};
    const repository = buildRepository({
      update: () => updateChain([{ id: 'match-1' }], captured),
    });
    const reload = jest
      .spyOn(repository, 'findById')
      .mockResolvedValue(storedRow as never);

    await repository.updateCourtState('match-1', storedCourtState);

    const rendered = renderScoreDetails(captured);
    expect(rendered.sql).toContain('jsonb_set(coalesce(');
    expect(rendered.sql).toContain("'{courtState}'");
    expect(rendered.params).toEqual([JSON.stringify(storedCourtState)]);
    expect(Object.keys(captured.set ?? {}).sort()).toEqual([
      'scoreDetails',
      'updatedAt',
    ]);
    expect(dialect.sqlToQuery(captured.where as SQL).sql).toContain(
      'deleted_at',
    );
    expect(reload).toHaveBeenCalledWith('match-1');
  });

  it('updateCourtState returns null and skips reload when no live row matches', async () => {
    const captured: CapturedUpdate = {};
    const repository = buildRepository({
      update: () => updateChain([], captured),
    });
    const reload = jest.spyOn(repository, 'findById');

    await expect(
      repository.updateCourtState('missing', storedCourtState),
    ).resolves.toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('updateScore keeps the DB courtState at UPDATE time and drops courtState from the payload', async () => {
    const captured: CapturedUpdate = {};
    const tx = {
      select: () => selectChain([storedRow]),
      update: () => updateChain([{ id: 'match-1' }], captured),
    };
    const repository = buildRepository({
      transaction: async (run: (t: unknown) => Promise<unknown>) => run(tx),
    });
    jest.spyOn(repository, 'findById').mockResolvedValue(storedRow as never);
    const payload = {
      sets: [{ team1Score: 11, team2Score: 5, isFinished: true }],
      courtState: { version: 1, forged: true },
    };

    await repository.updateScore('match-1', 'referee-1', {
      p1SetsWon: 1,
      p2SetsWon: 0,
      scoreDetails: payload,
    });

    const rendered = renderScoreDetails(captured);
    expect(rendered.sql).toContain("-> 'courtState' IS NULL");
    expect(rendered.sql).toContain("jsonb_build_object('courtState',");
    expect(rendered.sql).toContain("::jsonb - 'courtState'");
    expect(rendered.params).toEqual([JSON.stringify(payload)]);
  });

  it('completeMatchInTx (kết thúc trận, bye) keeps the DB courtState', async () => {
    const captured: CapturedUpdate = {};
    const tx = {
      select: () => selectChain([storedRow]),
      update: () => updateChain([], captured),
    };
    const repository = buildRepository({}) as unknown as CompleteMatchInTxAccess;

    await repository.completeMatchInTx(tx, 'match-1', 'team-1', {
      p1SetsWon: 1,
      p2SetsWon: 0,
      scoreDetails: { sets: [] },
    });

    expect(captured.set?.status).toBe('COMPLETED');
    expect(renderScoreDetails(captured).sql).toContain(
      "-> 'courtState' IS NULL",
    );
  });

  it('recordNonFinalOperation (hoãn/bỏ dở) keeps the DB courtState', async () => {
    const captured: CapturedUpdate = {};
    const tx = {
      select: () => selectChain([storedRow]),
      update: () => updateChain([{ id: 'match-1' }], captured),
    };
    const repository = buildRepository({
      transaction: async (run: (t: unknown) => Promise<unknown>) => run(tx),
    });
    jest.spyOn(repository, 'findById').mockResolvedValue(storedRow as never);

    await repository.recordNonFinalOperation('match-1', 'referee-1', {
      status: 'DISPUTED',
      scoreDetails: { sets: [] },
    });

    const rendered = renderScoreDetails(captured);
    expect(captured.set?.status).toBe('DISPUTED');
    expect(rendered.sql).toContain("-> 'courtState' IS NULL");
    expect(rendered.params).toEqual([JSON.stringify({ sets: [] })]);
  });
});
