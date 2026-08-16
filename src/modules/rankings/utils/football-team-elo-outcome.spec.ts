import { resolveFootballTeamEloOutcome } from './football-team-elo-outcome';

const p1 = 'participant-1';
const p2 = 'participant-2';

describe('resolveFootballTeamEloOutcome', () => {
  it('maps a regulation win to win/loss', () => {
    expect(
      resolveFootballTeamEloOutcome({
        winnerId: p1,
        participant1Id: p1,
        participant2Id: p2,
      }),
    ).toEqual({
      score1: 1,
      score2: 0,
      outcome1: 'WIN',
      outcome2: 'LOSS',
    });
  });

  it('keeps a regulation draw balanced', () => {
    expect(
      resolveFootballTeamEloOutcome({
        winnerId: null,
        participant1Id: p1,
        participant2Id: p2,
      }),
    ).toEqual({
      score1: 0.5,
      score2: 0.5,
      outcome1: 'DRAW',
      outcome2: 'DRAW',
    });
  });

  it('uses the winner for a shootout without a special audit label', () => {
    expect(
      resolveFootballTeamEloOutcome({
        winnerId: p2,
        participant1Id: p1,
        participant2Id: p2,
        specialAction: 'PENALTY_SHOOTOUT',
      }).outcome2,
    ).toBe('WIN');
  });

  it.each(['WALKOVER', 'NO_SHOW', 'DISQUALIFICATION'])(
    'labels %s as a special result',
    (specialAction) => {
      expect(
        resolveFootballTeamEloOutcome({
          winnerId: p1,
          participant1Id: p1,
          participant2Id: p2,
          specialAction,
        }),
      ).toMatchObject({ outcome1: 'FORFEIT', outcome2: 'NO_SHOW' });
    },
  );

  it('rejects a winner outside the fixture', () => {
    expect(() =>
      resolveFootballTeamEloOutcome({
        winnerId: 'other',
        participant1Id: p1,
        participant2Id: p2,
      }),
    ).toThrow('match participants');
  });
});
