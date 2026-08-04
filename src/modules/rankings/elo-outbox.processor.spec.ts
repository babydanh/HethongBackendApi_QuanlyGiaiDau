import { EloOutboxProcessor } from './elo-outbox.processor';
import type { RankingsService } from './rankings.service';

describe('EloOutboxProcessor — claim & state machine (NOTE-3, T13)', () => {
  let processor: EloOutboxProcessor;
  let mockDb: { execute: jest.Mock };
  let mockRankings: { processMatchResultFromOutbox: jest.Mock };

  beforeEach(() => {
    mockDb = { execute: jest.fn() };
    mockRankings = { processMatchResultFromOutbox: jest.fn().mockResolvedValue(undefined) };
    processor = new EloOutboxProcessor(
      mockDb as never,
      mockRankings as unknown as RankingsService,
    );
  });

  const sqlOf = (call: unknown[]): string => {
    const arg = call[0] as {
      queryChunks?: Array<{ value?: unknown[] }>;
      toSQL?: () => { sql: string };
    };
    if (arg?.toSQL) return arg.toSQL().sql;
    const parts = (arg?.queryChunks ?? []).flatMap((c) => c.value ?? []);
    const joined = parts.map((p) => (typeof p === 'string' ? p : String(p))).join('');
    if (joined) return joined;
    return String(arg);
  };

  describe('claimOne', () => {
    it('claims a PENDING row via the CTE and returns id + match_id', async () => {
      mockDb.execute.mockResolvedValueOnce([{ id: 'o1', match_id: 'm1' }]);

      const row = await (processor as unknown as { claimOne(): Promise<unknown> }).claimOne();

      expect(row).toEqual({ id: 'o1', match_id: 'm1' });
      const sqlArg = sqlOf(mockDb.execute.mock.calls[0]);
      expect(sqlArg).toContain('FOR UPDATE SKIP LOCKED');
      expect(sqlArg).toContain("status = 'PENDING'");
      expect(sqlArg).toContain('PROCESSING');
    });

    it('returns null when no eligible row', async () => {
      mockDb.execute.mockResolvedValueOnce([]);
      const row = await (processor as unknown as { claimOne(): Promise<unknown> }).claimOne();
      expect(row).toBeNull();
    });
  });

  describe('processClaimed', () => {
    it('marks PROCESSED and clears the lease on success', async () => {
      mockDb.execute.mockResolvedValueOnce([]); // no rows needed for success path updates

      await (processor as unknown as {
        processClaimed(row: { id: string; match_id: string }): Promise<void>;
      }).processClaimed({ id: 'o1', match_id: 'm1' });

      expect(mockRankings.processMatchResultFromOutbox).toHaveBeenCalledWith('m1');
      const lastUpdate = sqlOf(mockDb.execute.mock.calls.at(-1)!);
      expect(lastUpdate).toContain("status = 'PROCESSED'");
      expect(lastUpdate).toContain('locked_at = NULL');
    });

    it('returns a retryable failure to PENDING with backoff below the cap', async () => {
      mockRankings.processMatchResultFromOutbox.mockRejectedValueOnce(new Error('db timeout'));
      // attempts query returns 2 → below cap 5 → back to PENDING
      mockDb.execute
        .mockResolvedValueOnce([{ attempts: '2' }])
        .mockResolvedValueOnce([]);

      await (processor as unknown as {
        processClaimed(row: { id: string; match_id: string }): Promise<void>;
      }).processClaimed({ id: 'o1', match_id: 'm1' });

      const lastUpdate = sqlOf(mockDb.execute.mock.calls.at(-1)!);
      expect(lastUpdate).toContain("status = 'PENDING'");
      expect(lastUpdate).toContain('next_attempt_at = now() + interval');
      expect(lastUpdate).toContain('locked_at = NULL');
    });

    it('marks FAILED (terminal) after retry cap and does not claim again', async () => {
      mockRankings.processMatchResultFromOutbox.mockRejectedValueOnce(new Error('roster missing'));
      // attempts = 5 → at cap → FAILED terminal
      mockDb.execute
        .mockResolvedValueOnce([{ attempts: '5' }])
        .mockResolvedValueOnce([]);

      await (processor as unknown as {
        processClaimed(row: { id: string; match_id: string }): Promise<void>;
      }).processClaimed({ id: 'o1', match_id: 'm1' });

      const lastUpdate = sqlOf(mockDb.execute.mock.calls.at(-1)!);
      expect(lastUpdate).toContain("status = 'FAILED'");
      expect(lastUpdate).toContain('locked_at = NULL');
    });
  });
});
