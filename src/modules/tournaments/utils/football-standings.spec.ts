import { sortFootballStandings, FootballStandingMatch, FootballStandingRow } from './football-standings';

const row = (participantId: string, overrides: Partial<FootballStandingRow> = {}): FootballStandingRow => ({
  participantId,
  groupId: 'group-1',
  totalPoints: 3,
  pointsFor: 1,
  pointsAgainst: 1,
  won: 0,
  ...overrides,
});

describe('sortFootballStandings', () => {
  it('uses head-to-head points after aggregate points, goal difference and goals for', () => {
    const standings = [row('team-b'), row('team-a')];
    const matches: FootballStandingMatch[] = [{
      groupId: 'group-1',
      participant1Id: 'team-a',
      participant2Id: 'team-b',
      winnerId: 'team-a',
      scoreDetails: { football: { events: [] } },
    }];

    expect(sortFootballStandings(standings, matches).map((item) => item.participantId)).toEqual(['team-a', 'team-b']);
  });

  it('uses fair-play penalty after head-to-head remains equal', () => {
    const standings = [row('team-b'), row('team-a'), row('team-c')];
    const draw = (participant1Id: string, participant2Id: string, events: unknown[] = []): FootballStandingMatch => ({
      groupId: 'group-1',
      participant1Id,
      participant2Id,
      winnerId: null,
      scoreDetails: { football: { events } },
    });
    const matches = [
      draw('team-a', 'team-b', [{ team: 2, type: 'YELLOW_CARD' }]),
      draw('team-b', 'team-c'),
      draw('team-c', 'team-a'),
    ];

    expect(sortFootballStandings(standings, matches).map((item) => item.participantId)).toEqual(['team-a', 'team-c', 'team-b']);
  });

  it('keeps a deterministic participant id order when every tie-break is equal', () => {
    const standings = [row('team-c'), row('team-a'), row('team-b')];

    expect(sortFootballStandings(standings, []).map((item) => item.participantId)).toEqual(['team-a', 'team-b', 'team-c']);
  });
});
