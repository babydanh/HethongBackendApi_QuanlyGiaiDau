import { EloEngineService } from './elo-engine.service';

describe('EloEngineService', () => {
  const service = new EloEngineService();

  it('splits points evenly for equally rated new players', () => {
    expect(service.calculateElo(1000, 1000, true, 0, 0)).toEqual({
      newElo: 1020,
      changedPoints: 20,
      newWinStreak: 1,
      newPeakElo: 1020,
    });
    expect(service.calculateElo(1000, 1000, false, 0, 0)).toEqual({
      newElo: 980,
      changedPoints: -20,
      newWinStreak: 0,
      newPeakElo: 980,
    });
  });

  it('rewards an upset more than an expected win', () => {
    const upset = service.calculateElo(1000, 1500, true, 0, 0);
    const expectedWin = service.calculateElo(1500, 1000, true, 0, 0);

    expect(upset.changedPoints).toBeGreaterThan(expectedWin.changedPoints);
  });

  it('reduces volatility as match experience increases', () => {
    const newcomer = service.calculateElo(1000, 1000, true, 0, 0);
    const experienced = service.calculateElo(1000, 1000, true, 100, 0);

    expect(newcomer.changedPoints).toBeGreaterThan(experienced.changedPoints);
  });

  it('never reduces ELO below the system floor', () => {
    const result = service.calculateElo(100, 2000, false, 0, 0);

    expect(result.newElo).toBe(100);
    expect(result.changedPoints).toBe(0);
  });

  it('ignores scoreRatio=0 for backward compatibility', () => {
    // scoreRatio=0 giống undefined — không ảnh hưởng
    const without = service.calculateElo(1000, 1000, true, 0, 0);
    const withZero = service.calculateElo(1000, 1000, true, 0, 0, 0);

    expect(withZero).toEqual(without);
  });

  it('does not boost ELO for a close match (scoreRatio=0.5)', () => {
    const close = service.calculateElo(1000, 1000, true, 0, 0, 0.5);

    const normal = service.calculateElo(1000, 1000, true, 0, 0);

    // 0.5 → scoreFactor=1.0 → kết quả giống không có scoreRatio
    expect(close.changedPoints).toBe(normal.changedPoints);
  });

  it('boosts ELO gain for a dominant win (scoreRatio=0.78)', () => {
    const dominant = service.calculateElo(1000, 1000, true, 0, 0, 0.78);
    const normal = service.calculateElo(1000, 1000, true, 0, 0);

    // Dominant win (78% points) → scoreFactor ~1.33 → ELO tăng nhiều hơn
    expect(dominant.changedPoints).toBeGreaterThan(normal.changedPoints);
    expect(dominant.newElo).toBeGreaterThan(normal.newElo);
  });

  it('amplifies loss for a destroyed loser (scoreRatio=0.78)', () => {
    const destroyed = service.calculateElo(1000, 1000, false, 0, 0, 0.78);
    const normal = service.calculateElo(1000, 1000, false, 0, 0);

    // Bị hủy diệt → mất nhiều ELO hơn
    expect(destroyed.changedPoints).toBeLessThan(normal.changedPoints);
    expect(destroyed.newElo).toBeLessThan(normal.newElo);
  });

  it('applies decay so experienced players get less score factor boost', () => {
    // New player: 0 matches → full effect
    const newPlayer = service.calculateElo(1000, 1000, true, 0, 0, 0.78);
    // Experienced player: 20 matches → 20% effect
    const experienced = service.calculateElo(1000, 1000, true, 20, 0, 0.78);

    const gainNew = newPlayer.changedPoints - 20; // extra beyond base 20
    const gainExp = experienced.changedPoints - 20;

    expect(gainNew).toBeGreaterThan(gainExp);
  });

  it('clamps extreme scoreRatio to [0.5, 0.85]', () => {
    // scoreRatio=0.95 (quá hủy diệt) → clamped to 0.85
    const clamped = service.calculateElo(1000, 1000, true, 0, 0, 0.95);
    const normal = service.calculateElo(1000, 1000, true, 0, 0, 0.85);

    expect(clamped).toEqual(normal);
  });
});
