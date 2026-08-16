import { aggregateFootballTwoLegs } from './football-two-leg-aggregate';

const leg = (
  participant1Id: string,
  participant2Id: string,
  team1Goals: number,
  team2Goals: number,
) => ({
  participant1Id,
  participant2Id,
  p1SetsWon: team1Goals,
  p2SetsWon: team2Goals,
  scoreDetails: { football: { team1Goals, team2Goals } },
});

describe('aggregateFootballTwoLegs', () => {
  it('maps the second leg by participant identity when home and away swap', () => {
    expect(aggregateFootballTwoLegs(leg('a', 'b', 1, 0), leg('b', 'a', 1, 2))).toMatchObject({
      participant1Goals: 3,
      participant2Goals: 1,
      winnerId: 'a',
    });
  });

  it('uses football goals instead of p1/p2 set counters', () => {
    expect(aggregateFootballTwoLegs(leg('a', 'b', 3, 2), leg('a', 'b', 0, 1))).toMatchObject({
      participant1Goals: 3,
      participant2Goals: 3,
      winnerId: null,
    });
  });

  it('uses a valid shootout winner only when aggregate is tied', () => {
    expect(aggregateFootballTwoLegs(leg('a', 'b', 1, 0), leg('b', 'a', 1, 0), 'b')).toMatchObject({
      participant1Goals: 1,
      participant2Goals: 1,
      winnerId: 'b',
    });
    expect(aggregateFootballTwoLegs(leg('a', 'b', 2, 0), leg('b', 'a', 0, 0), 'b').winnerId).toBe('a');
  });
});
