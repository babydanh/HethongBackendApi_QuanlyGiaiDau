import { RankingsService } from './rankings.service';

/**
 * recalculateEloChain DELETEs + REINSERTS elo_history_logs per user inside its
 * match loop. Without a consent filter, one admin call re-scored every completed
 * match — including ones whose players never consented — silently voiding the
 * enqueue and apply gates.
 *
 * These drive the real loop and assert on the destructive call itself. A spy on a
 * helper, or a source-text check, could pass while the gate was wired to the wrong
 * place or computed from rows the loop never loads.
 */
describe('recalculateEloChain consent gate', () => {
  const COMPLETED_AT = new Date('2026-06-01T10:00:00Z');

  const matchRow = () => ({
    match: {
      id: 'm1',
      winnerId: 'p1',
      participant1Id: 'p1',
      participant2Id: 'p2',
      completedAt: COMPLETED_AT,
      updatedAt: COMPLETED_AT,
    },
    stage: { id: 'stage-1' },
    tournament: { id: 't-1', categoryId: 'cat', matchType: 'KNOCKOUT' },
  });

  /** `linkedAt` defaults to the consent instant: confirming through the endpoint stamps both together. */
  const roster = (
    userId: string,
    consentedAt: Date | null,
    linkedAt: Date | null = consentedAt,
  ) => ({
    userId,
    rankingConsentAt: consentedAt,
    accountLinkConfirmedAt: linkedAt,
  });

  /** tx stub: resolves queued results in await order, [] once exhausted. */
  const createTx = (results: unknown[][]) => {
    const queue = [...results];
    const deletes: unknown[] = [];
    const inserts: unknown[] = [];
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = jest.fn(self);
    chain.from = jest.fn(self);
    chain.innerJoin = jest.fn(self);
    chain.where = jest.fn(self);
    chain.orderBy = jest.fn(self);
    chain.limit = jest.fn(self);
    chain.delete = jest.fn(() => {
      deletes.push('deleted');
      return { where: jest.fn().mockResolvedValue(undefined) };
    });
    chain.insert = jest.fn(() => ({
      values: jest.fn((row: unknown) => {
        inserts.push(row);
        return Promise.resolve(undefined);
      }),
    }));
    chain.update = jest.fn(() => ({
      set: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
    }));
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve().then(() => resolve(queue.shift() ?? []));
    return { tx: chain, deletes, inserts };
  };

  /** Stands in for the engine only where a test lets a match reach the scoring step. */
  const scoringEngine = {
    calculateElo: jest
      .fn()
      .mockReturnValue({ newElo: 1016, changedPoints: 16, newWinStreak: 1 }),
  };

  const runRecalculate = (tx: unknown, eloEngine: unknown = {}) => {
    const service = new RankingsService(
      tx as never,
      {} as never,
      eloEngine as never,
      { delByPattern: jest.fn(), get: jest.fn(), set: jest.fn() } as never,
    );
    // The tier recompute after the loop takes an advisory lock and rebuilds ranks: not what
    // these cases are about, so it is stubbed and the assertions stay on the destructive step.
    jest
      .spyOn(
        service as unknown as { recalculateUserRankTier: () => Promise<void> },
        'recalculateUserRankTier',
      )
      .mockResolvedValue(undefined);
    return (
      service as unknown as {
        recalculateEloChain(
          txArg: unknown,
          playerIds: string[],
          fromTime: Date,
          categoryId: string,
          matchType: string,
        ): Promise<void>;
      }
    ).recalculateEloChain(
      tx,
      ['u1', 'u2'],
      new Date('2026-05-01T00:00:00Z'),
      'cat',
      'KNOCKOUT',
    );
  };

  it('never deletes elo history when a player never consented', async () => {
    const { tx, deletes } = createTx([
      [matchRow()], // matches select
      [roster('u1', new Date('2026-05-01T00:00:00Z'))], // winner rosters
      [roster('u2', null)], // loser rosters — never confirmed
    ]);

    await runRecalculate(tx);

    expect(deletes).toHaveLength(0);
  });

  it('never deletes elo history when consent came after the match completed', async () => {
    // V7: the confirmation instant decides the boundary, so a match finished an
    // hour before consent stays permanently unscored.
    const { tx, deletes } = createTx([
      [matchRow()],
      [roster('u1', new Date('2026-05-01T00:00:00Z'))],
      [roster('u2', new Date('2026-06-01T11:00:00Z'))],
    ]);

    await runRecalculate(tx);

    expect(deletes).toHaveLength(0);
  });

  it('never deletes elo history for a player who agreed to be ranked but never confirmed the account link', async () => {
    // Self-registration stamps only the ranking consent. Re-scoring would write ELO for an
    // account the player has not claimed, which the match feed and achievements still hide.
    const { tx, deletes } = createTx([
      [matchRow()],
      [roster('u1', new Date('2026-05-01T00:00:00Z'))],
      [roster('u2', new Date('2026-05-01T00:00:00Z'), null)],
    ]);

    await runRecalculate(tx);

    expect(deletes).toHaveLength(0);
  });

  it('never deletes elo history when the account link was confirmed after the match completed', async () => {
    const { tx, deletes } = createTx([
      [matchRow()],
      [roster('u1', new Date('2026-05-01T00:00:00Z'))],
      [
        roster(
          'u2',
          new Date('2026-05-01T00:00:00Z'),
          new Date('2026-06-01T11:00:00Z'),
        ),
      ],
    ]);

    await runRecalculate(tx);

    expect(deletes).toHaveLength(0);
  });

  it('never deletes elo history when a participant carries no roster row', async () => {
    // An Excel-imported entrant with no account cannot confirm; `[].every()` style
    // logic would treat "no rows" as "all good" and score them.
    const { tx, deletes } = createTx([
      [matchRow()],
      [roster('u1', new Date('2026-05-01T00:00:00Z'))],
      [], // loser has no roster rows at all
    ]);

    await runRecalculate(tx);

    expect(deletes).toHaveLength(0);
  });

  it('re-scores a match when both marks precede it (the gate does not reject everything)', async () => {
    // Positive control for the cases above: without it they would also pass if the gate
    // wrongly rejected every match. Past the gate the loop deletes and re-inserts one
    // history row per roster user.
    const { tx, deletes, inserts } = createTx([
      [matchRow()],
      [roster('u1', new Date('2026-05-01T00:00:00Z'))],
      [roster('u2', new Date('2026-05-01T00:00:00Z'))],
    ]);

    await runRecalculate(tx, scoringEngine);

    expect(deletes).toHaveLength(2);
    expect(inserts).toMatchObject([
      { userId: 'u1', reason: 'MATCH_WIN' },
      { userId: 'u2', reason: 'MATCH_LOSS' },
    ]);
  });
});
