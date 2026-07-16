import { EloEngineService } from './elo-engine.service';

describe('EloEngineService', () => {
  const service = new EloEngineService();

  it('splits points evenly for equally rated new players', () => {
    expect(service.calculateElo(1000, 1000, true, 0, 0)).toEqual({
      newElo: 1020,
      changedPoints: 20,
      newWinStreak: 1,
    });
    expect(service.calculateElo(1000, 1000, false, 0, 0)).toEqual({
      newElo: 980,
      changedPoints: -20,
      newWinStreak: 0,
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
});
