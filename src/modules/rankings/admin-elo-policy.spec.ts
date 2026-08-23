import {
  ADMIN_STARTING_ELO,
  calculateAdminElo,
  resolveRankingVisibility,
  shouldGrantAdminLeaderboardBootstrap,
} from './admin-elo-policy';

describe('admin Elo policy', () => {
  it('adds, subtracts, and sets Elo exactly', () => {
    expect(calculateAdminElo(1200, 'ADD', 75)).toBe(1275);
    expect(calculateAdminElo(1200, 'SUBTRACT', 75)).toBe(1125);
    expect(calculateAdminElo(1200, 'SET', 1350)).toBe(1350);
  });

  it('rejects a subtraction that would make Elo negative', () => {
    expect(() => calculateAdminElo(20, 'SUBTRACT', 21)).toThrow(
      'ELO_CANNOT_BE_NEGATIVE',
    );
  });

  it('resets to the documented starting Elo', () => {
    expect(calculateAdminElo(1980, 'RESET')).toBe(ADMIN_STARTING_ELO);
  });

  it('requires a value for non-reset rating operations', () => {
    expect(() => calculateAdminElo(1000, 'ADD')).toThrow('ELO_VALUE_REQUIRED');
  });

  it('grants bootstrap eligibility only for ADD on a zero-match profile', () => {
    expect(shouldGrantAdminLeaderboardBootstrap('ADD', 0, false)).toBe(true);
    expect(shouldGrantAdminLeaderboardBootstrap('ADD', 0, true)).toBe(false);
    expect(shouldGrantAdminLeaderboardBootstrap('ADD', 1, false)).toBe(false);
    expect(shouldGrantAdminLeaderboardBootstrap('SET', 0, false)).toBe(false);
    expect(shouldGrantAdminLeaderboardBootstrap('RESET', 0, false)).toBe(false);
  });

  it('treats missing and expired visibility statuses as visible', () => {
    const now = new Date('2026-08-23T00:00:00.000Z');
    expect(resolveRankingVisibility(null, null, now)).toBe('VISIBLE');
    expect(
      resolveRankingVisibility(
        'BANNED',
        new Date('2026-08-22T00:00:00.000Z'),
        now,
      ),
    ).toBe('VISIBLE');
  });

  it('preserves active hidden and banned states', () => {
    const now = new Date('2026-08-23T00:00:00.000Z');
    expect(resolveRankingVisibility('HIDDEN', null, now)).toBe('HIDDEN');
    expect(
      resolveRankingVisibility(
        'BANNED',
        new Date('2026-08-24T00:00:00.000Z'),
        now,
      ),
    ).toBe('BANNED');
  });
});
