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

  const roster = (userId: string, consentedAt: Date | null) => ({
    userId,
    rankingConsentAt: consentedAt,
  });

  /** tx stub: resolves queued results in await order, [] once exhausted. */
  const createTx = (results: unknown[][]) => {
    const queue = [...results];
    const deletes: unknown[] = [];
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = jest.fn(self);
    chain.from = jest.fn(self);
    chain.innerJoin = jest.fn(self);
    chain.where = jest.fn(self);
    chain.orderBy = jest.fn(self);
    chain.delete = jest.fn(() => {
      deletes.push('deleted');
      return { where: jest.fn().mockResolvedValue(undefined) };
    });
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve().then(() => resolve(queue.shift() ?? []));
    return { tx: chain, deletes };
  };

  const runRecalculate = (tx: unknown) => {
    const service = new RankingsService(
      tx as never,
      {} as never,
      {} as never,
      { delByPattern: jest.fn(), get: jest.fn(), set: jest.fn() } as never,
    );
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
});
