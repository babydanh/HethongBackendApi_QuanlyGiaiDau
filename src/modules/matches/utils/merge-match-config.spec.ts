import { mergeMatchConfig } from './merge-match-config';

describe('mergeMatchConfig', () => {
  it('preserves existing scoring rules when a schedule sends only duration', () => {
    expect(
      mergeMatchConfig(
        { kind: 'PICKLEBALL_RALLY', setsToWin: 2, pointsPerSet: 11 },
        { durationMinutes: 15 },
      ),
    ).toEqual({
      kind: 'PICKLEBALL_RALLY',
      setsToWin: 2,
      pointsPerSet: 11,
      durationMinutes: 15,
    });
  });

  it('keeps compatibility with a full override object', () => {
    expect(
      mergeMatchConfig(
        { setsToWin: 2, pointsPerSet: 11 },
        { setsToWin: 3, pointsPerSet: 21 },
      ),
    ).toEqual({ setsToWin: 3, pointsPerSet: 21 });
  });

  it('clears the override only when the caller sends null', () => {
    expect(mergeMatchConfig({ pointsPerSet: 11 }, null)).toEqual({});
  });

  it('does not spread malformed legacy JSON into the new object', () => {
    expect(mergeMatchConfig(['legacy'], { durationMinutes: 30 })).toEqual({
      durationMinutes: 30,
    });
  });
});
