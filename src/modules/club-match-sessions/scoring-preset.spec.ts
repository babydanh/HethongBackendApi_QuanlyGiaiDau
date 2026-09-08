import {
  sanitizeScoringPresets,
  selectScoringPreset,
} from './scoring-preset';

describe('scoring presets', () => {
  it('keeps only bounded scoring fields', () => {
    expect(
      sanitizeScoringPresets({
        tennis: {
          setsToWin: 2,
          pointsPerSet: 6,
          maxPoints: 7,
          mustWinByTwo: true,
          scoringModel: 'tennis_set',
          unsupported: 'ignored',
          tooHigh: 1000,
        },
      }),
    ).toEqual({
      tennis: {
        setsToWin: 2,
        pointsPerSet: 6,
        maxPoints: 7,
        mustWinByTwo: true,
        scoringModel: 'TENNIS_SET',
      },
    });
  });

  it('returns the preset for the club sport and supports slug aliases', () => {
    expect(
      selectScoringPreset(
        { table_tennis: { pointsPerSet: 11 } },
        'table-tennis',
      ),
    ).toEqual({ pointsPerSet: 11 });
  });
});
