import { BadRequestException } from '@nestjs/common';
import { validateScoreDetails } from './validate-score-details';
import type { ResolvedSportRulesConfig } from '../../../tournaments/utils/sport-rules/sport-rules.types';

function buildResolvedConfig(
  overrides: Partial<ResolvedSportRulesConfig>,
): ResolvedSportRulesConfig {
  return {
    version: 1,
    kind: 'BADMINTON',
    scoringModel: 'RALLY_POINT_SET',
    format: {},
    bestOf: 3,
    setsToWin: 2,
    pointsPerSet: 21,
    deuceEnabled: true,
    mustWinByTwo: true,
    tiebreakAt: 20,
    maxPoints: 30,
    tiebreakPoints: null,
    ...overrides,
  };
}

describe('validateScoreDetails', () => {
  it('accepts valid tennis aggregate scores', () => {
    const result = validateScoreDetails(
      {
        set1: '6-4',
        set2: '7-6',
      },
      buildResolvedConfig({
        kind: 'TENNIS',
        scoringModel: 'TENNIS_SET',
        bestOf: 3,
        setsToWin: 2,
        pointsPerSet: 6,
        maxPoints: 7,
        tiebreakAt: 6,
        tiebreakPoints: 7,
      }),
    );

    expect(result).toEqual({
      p1SetsWon: 2,
      p2SetsWon: 0,
      setsToWin: 2,
      totalSets: 2,
    });
  });

  it('rejects invalid tennis score 6-5', () => {
    expect(() =>
      validateScoreDetails(
        {
          set1: '6-5',
        },
        buildResolvedConfig({
          kind: 'TENNIS',
          scoringModel: 'TENNIS_SET',
          bestOf: 3,
          setsToWin: 2,
          pointsPerSet: 6,
          maxPoints: 7,
          tiebreakAt: 6,
          tiebreakPoints: 7,
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts pickleball side-out score with valid sideOutState metadata', () => {
    const result = validateScoreDetails(
      {
        game1: '11-9',
        sideOutState: {
          servingTeam: 1,
          serverNumber: 2,
          openingSequenceDone: true,
        },
      },
      buildResolvedConfig({
        kind: 'PICKLEBALL_SIDE_OUT',
        scoringModel: 'PICKLEBALL_SIDE_OUT',
        bestOf: 1,
        setsToWin: 1,
        pointsPerSet: 11,
        maxPoints: 11,
        tiebreakAt: 10,
        tiebreakPoints: 11,
      }),
    );

    expect(result).toEqual({
      p1SetsWon: 1,
      p2SetsWon: 0,
      setsToWin: 1,
      totalSets: 1,
    });
  });

  it('rejects pickleball side-out metadata when server number is invalid', () => {
    expect(() =>
      validateScoreDetails(
        {
          game1: '11-9',
          sideOutState: {
            servingTeam: 1,
            serverNumber: 3,
            openingSequenceDone: true,
          },
        },
        buildResolvedConfig({
          kind: 'PICKLEBALL_SIDE_OUT',
          scoringModel: 'PICKLEBALL_SIDE_OUT',
          bestOf: 1,
          setsToWin: 1,
          pointsPerSet: 11,
          maxPoints: 11,
          tiebreakAt: 10,
          tiebreakPoints: 11,
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('ignores non-score metadata keys while still validating real set keys', () => {
    const result = validateScoreDetails(
      {
        set1: '21-18',
        specialResult: {
          action: 'WALKOVER',
        },
        note: 'metadata only',
      },
      buildResolvedConfig({}),
    );

    expect(result).toEqual({
      p1SetsWon: 1,
      p2SetsWon: 0,
      setsToWin: 2,
      totalSets: 1,
    });
  });

  it('rejects extra set entries after the match is already decided', () => {
    expect(() =>
      validateScoreDetails(
        {
          set1: '21-19',
          set2: '21-18',
          set3: '18-21',
        },
        buildResolvedConfig({
          bestOf: 3,
          setsToWin: 2,
        }),
      ),
    ).toThrow(BadRequestException);
  });
});
