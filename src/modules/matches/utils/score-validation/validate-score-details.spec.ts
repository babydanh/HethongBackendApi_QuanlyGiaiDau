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

  it('accepts tennis scoreDetails with the final set still in progress', () => {
    const result = validateScoreDetails(
      {
        sets: [
          { team1Score: 6, team2Score: 4, isFinished: true },
          { team1Score: 3, team2Score: 2, isFinished: false },
        ],
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
      p1SetsWon: 1,
      p2SetsWon: 0,
      setsToWin: 2,
      totalSets: 2,
    });
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

  it('accepts pickleball side-out with the current game still in progress', () => {
    const result = validateScoreDetails(
      {
        sets: [{ team1Score: 8, team2Score: 6, isFinished: false }],
        sideOutState: {
          servingTeam: 2,
          serverNumber: 1,
          openingSequenceDone: true,
        },
      },
      buildResolvedConfig({
        kind: 'PICKLEBALL_SIDE_OUT',
        scoringModel: 'PICKLEBALL_SIDE_OUT',
        bestOf: 1,
        setsToWin: 1,
        pointsPerSet: 11,
        maxPoints: 15,
        tiebreakAt: 10,
        tiebreakPoints: 11,
      }),
    );

    expect(result).toEqual({
      p1SetsWon: 0,
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

  it('accepts rally-point scoreDetails with the final set still in progress', () => {
    const result = validateScoreDetails(
      {
        sets: [
          { team1Score: 21, team2Score: 18, isFinished: true },
          { team1Score: 10, team2Score: 7, isFinished: false },
        ],
      },
      buildResolvedConfig({
        kind: 'BADMINTON',
        scoringModel: 'RALLY_POINT_SET',
        bestOf: 3,
        setsToWin: 2,
        pointsPerSet: 21,
        maxPoints: 30,
        tiebreakAt: 20,
      }),
    );

    expect(result).toEqual({
      p1SetsWon: 1,
      p2SetsWon: 0,
      setsToWin: 2,
      totalSets: 2,
    });
  });

  it('keeps validating later sets after an earlier set was approved as an override', () => {
    const result = validateScoreDetails(
      {
        sets: [
          {
            team1Score: 9,
            team2Score: 4,
            isFinished: true,
            scoreOverride: {
              reason: 'Trọng tài chốt set rút gọn',
              decidedAt: '2026-07-14T08:00:00.000Z',
              decidedBy: 'referee-id',
            },
          },
          { team1Score: 4, team2Score: 2, isFinished: false },
        ],
      },
      buildResolvedConfig({
        kind: 'PICKLEBALL_RALLY',
        scoringModel: 'RALLY_POINT_SET',
        bestOf: 3,
        setsToWin: 2,
        pointsPerSet: 11,
        maxPoints: 15,
        tiebreakAt: 10,
      }),
    );

    expect(result).toEqual({
      p1SetsWon: 1,
      p2SetsWon: 0,
      setsToWin: 2,
      totalSets: 2,
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

  it('FOOTBALL accepts win score 2-1', () => {
    const result = validateScoreDetails(
      { set1: '2-1' },
      buildResolvedConfig({
        kind: 'FOOTBALL',
        bestOf: 1,
        setsToWin: 1,
        pointsPerSet: 1,
        maxPoints: 99,
      }),
    );

    expect(result).toEqual({
      p1SetsWon: 1,
      p2SetsWon: 0,
      setsToWin: 1,
      totalSets: 1,
    });
  });

  it('FOOTBALL accepts draw 0-0 (no forced winner)', () => {
    const result = validateScoreDetails(
      { set1: '0-0' },
      buildResolvedConfig({
        kind: 'FOOTBALL',
        bestOf: 1,
        setsToWin: 1,
        pointsPerSet: 1,
        maxPoints: 99,
      }),
    );

    expect(result).toEqual({
      p1SetsWon: 0,
      p2SetsWon: 0,
      setsToWin: 1,
      totalSets: 1,
    });
  });

  it('FOOTBALL accepts draw 2-2', () => {
    const result = validateScoreDetails(
      { set1: '2-2' },
      buildResolvedConfig({
        kind: 'FOOTBALL',
        bestOf: 1,
        setsToWin: 1,
        pointsPerSet: 1,
        maxPoints: 99,
      }),
    );

    expect(result).toEqual({
      p1SetsWon: 0,
      p2SetsWon: 0,
      setsToWin: 1,
      totalSets: 1,
    });
  });

  it('FOOTBALL validates phase and event bounds in the structured payload', () => {
    const result = validateScoreDetails(
      {
        football: {
          team1Goals: 2,
          team2Goals: 1,
          phase: 'FULL_TIME',
          events: [{ type: 'GOAL', team: 1, minute: 12 }],
        },
      },
      buildResolvedConfig({
        kind: 'FOOTBALL',
        bestOf: 1,
        setsToWin: 1,
        pointsPerSet: 1,
        maxPoints: 99,
      }),
    );

    expect(result.p1SetsWon).toBe(1);
    expect(result.p2SetsWon).toBe(0);
  });

  it('FOOTBALL rejects an invalid phase or event team', () => {
    expect(() =>
      validateScoreDetails(
        { football: { team1Goals: 0, team2Goals: 0, phase: 'INVALID' } },
        buildResolvedConfig({
          kind: 'FOOTBALL',
          bestOf: 1,
          setsToWin: 1,
          pointsPerSet: 1,
          maxPoints: 99,
        }),
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      validateScoreDetails(
        {
          football: {
            team1Goals: 0,
            team2Goals: 0,
            phase: 'FULL_TIME',
            events: [{ type: 'GOAL', team: 3 }],
          },
        },
        buildResolvedConfig({
          kind: 'FOOTBALL',
          bestOf: 1,
          setsToWin: 1,
          pointsPerSet: 1,
          maxPoints: 99,
        }),
      ),
    ).toThrow(BadRequestException);
  });

  it('FOOTBALL enforces match-clock and stoppage-time bounds', () => {
    const config = buildResolvedConfig({
      kind: 'FOOTBALL',
      bestOf: 1,
      setsToWin: 1,
      pointsPerSet: 1,
      maxPoints: 99,
    });
    expect(() =>
      validateScoreDetails(
        {
          football: {
            team1Goals: 0,
            team2Goals: 0,
            phase: 'SECOND_HALF',
            minute: 151,
          },
        },
        config,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateScoreDetails(
        {
          football: {
            team1Goals: 0,
            team2Goals: 0,
            phase: 'STOPPAGE_TIME',
            addedMinute: 31,
          },
        },
        config,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateScoreDetails(
        {
          football: {
            team1Goals: 0,
            team2Goals: 0,
            phase: 'SECOND_HALF',
            events: [{ type: 'GOAL', team: 1, minute: 90, addedMinute: 31 }],
          },
        },
        config,
      ),
    ).toThrow(BadRequestException);
  });
});
