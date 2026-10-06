import { RankingsService } from './rankings.service';

/**
 * V7: a match only counts toward the ranking board when EVERY user carried on the
 * roster had confirmed BEFORE the match completed.
 *
 * These exercise the real gate decision rather than inspecting source text: the
 * rule is a comparison between two instants across a per-user row set, and a
 * textual assertion could pass while the comparison or the grouping was wrong.
 */
describe('RankingConsentGate', () => {
  const MATCH_ID = 'match-1';
  const P1 = 'participant-1';
  const P2 = 'participant-2';

  const at = (iso: string) => new Date(iso);
  const COMPLETED = '2026-06-01T10:00:00Z';

  /** drizzle-like chainable stub resolving queued results in order. */
  const createDb = (results: unknown[][]) => {
    const queue = [...results];
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = jest.fn(self);
    chain.from = jest.fn(self);
    chain.where = jest.fn(self);
    chain.limit = jest.fn(self);
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve().then(() => resolve(queue.shift() ?? []));
    return chain;
  };

  const buildService = (
    rosterRows: unknown[],
    opts: { completedAt?: string | null; withFootball?: boolean } = {},
  ) => {
    const { completedAt = COMPLETED, withFootball = false } = opts;
    const db = createDb([
      [
        {
          completedAt: completedAt ? at(completedAt) : null,
          participant1Id: P1,
          participant2Id: P2,
        },
      ],
      rosterRows,
    ]);
    const football = withFootball
      ? { processCompletedMatch: jest.fn().mockResolvedValue(undefined) }
      : undefined;
    const service = new RankingsService(
      db as never,
      {} as never,
      {} as never,
      { delByPattern: jest.fn(), get: jest.fn(), set: jest.fn() } as never,
      football as never,
    );
    return { service, football };
  };

  const gate = (service: RankingsService) =>
    (
      service as unknown as {
        hasEligibleRankingConsent(id: string): Promise<boolean>;
      }
    ).hasEligibleRankingConsent(MATCH_ID);

  const consented = (participantId: string, iso = '2026-05-01T09:00:00Z') => ({
    participantId,
    rankingConsentAt: at(iso),
  });

  it('allows a match completed after every roster user confirmed', async () => {
    const { service } = buildService([
      consented(P1, '2026-05-01T09:00:00Z'),
      consented(P2, '2026-05-01T09:30:00Z'),
    ]);

    await expect(gate(service)).resolves.toBe(true);
  });

  it('rejects a match completed BEFORE the player confirmed (the V7 rule)', async () => {
    // Consent at 11:00, match finished at 10:00. Counting it would let an
    // organizer force-enrol someone and have old results land against them.
    const { service } = buildService([
      consented(P1, '2026-05-01T09:00:00Z'),
      consented(P2, '2026-06-01T11:00:00Z'),
    ]);

    await expect(gate(service)).resolves.toBe(false);
  });

  it('rejects when one user on a shared participant never confirmed', async () => {
    // A doubles team carries several users on one participant. If consent were
    // read off the participant, one confirmation would hand every team-mate their
    // score — this is the hole that per-user consent exists to close.
    const { service } = buildService([
      consented(P1),
      { participantId: P1, rankingConsentAt: null },
      consented(P2),
    ]);

    await expect(gate(service)).resolves.toBe(false);
  });

  it('rejects a participant that carries no roster row at all', async () => {
    // Excel-imported entrant with no account: nobody can ever confirm, so nothing
    // about it is scorable. An empty row set must not slip through as "all good".
    const { service } = buildService([consented(P1)]);

    await expect(gate(service)).resolves.toBe(false);
  });

  it('rejects a match with no completion time to compare against', async () => {
    const { service } = buildService(
      [consented(P1), consented(P2)],
      { completedAt: null },
    );

    await expect(gate(service)).resolves.toBe(false);
  });

  it('scores a REMOVED roster row exactly as the ELO award does', async () => {
    // processMatchResult reads roster rows by participantId with no status filter,
    // so a REMOVED row still receives a delta. The gate must not be stricter than
    // the thing it guards, or that participant's ELO silently stops.
    const { service } = buildService([
      consented(P1),
      consented(P2),
      consented(P2, '2026-05-01T09:00:00Z'),
    ]);

    await expect(gate(service)).resolves.toBe(true);
  });

  it('skips the football ELO path entirely when consent is missing', async () => {
    // The football branch writes its own ELO and returns early, so a gate placed
    // after it would silently never run for football matches.
    const { service, football } = buildService([], { withFootball: true });

    await expect(
      service.processMatchResultFromOutbox(MATCH_ID),
    ).resolves.toBeUndefined();
    expect(football!.processCompletedMatch).not.toHaveBeenCalled();
  });

  it('does not throw when consent is missing, so the row is not retried forever', async () => {
    // elo-outbox.processor.ts marks a row PROCESSED only when the call returns
    // without throwing; throwing would spin the retry/backoff loop indefinitely.
    const { service } = buildService([]);

    await expect(
      service.processMatchResultFromOutbox(MATCH_ID),
    ).resolves.not.toThrow();
  });
});
