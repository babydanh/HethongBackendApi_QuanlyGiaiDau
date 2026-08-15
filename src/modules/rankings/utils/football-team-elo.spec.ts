import { calculateFootballTeamElo } from './football-team-elo';

describe('calculateFootballTeamElo', () => {
  it('keeps equal teams balanced on a draw', () => {
    expect(calculateFootballTeamElo(1000, 1000, 0.5)).toEqual({
      expected1: 0.5,
      expected2: 0.5,
      delta1: 0,
      delta2: 0,
    });
  });

  it('is zero-sum for a decisive result', () => {
    const result = calculateFootballTeamElo(1000, 1000, 1);
    expect(result.delta1).toBe(16);
    expect(result.delta2).toBe(-16);
    expect(result.delta1 + result.delta2).toBe(0);
  });

  it('rewards an upset more than an expected win', () => {
    const upset = calculateFootballTeamElo(1000, 1400, 1);
    const expectedWin = calculateFootballTeamElo(1400, 1000, 1);
    expect(upset.delta1).toBeGreaterThan(expectedWin.delta1);
  });

  it('rejects invalid numeric inputs', () => {
    expect(() => calculateFootballTeamElo(Number.NaN, 1000, 1)).toThrow();
    expect(() => calculateFootballTeamElo(1000, 1000, 1, 0)).toThrow();
  });
});
