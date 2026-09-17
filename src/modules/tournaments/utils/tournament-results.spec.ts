import {
  groupTournamentResultMembers,
  selectTopTournamentStandings,
} from './tournament-results';

describe('groupTournamentResultMembers', () => {
  it('keeps members grouped by their exact participant id', () => {
    const grouped = groupTournamentResultMembers([
      { participantId: 'third-a', userId: 'user-a1', fullName: 'A1', avatarUrl: null },
      { participantId: 'third-a', userId: 'user-a2', fullName: 'A2', avatarUrl: 'a2.jpg' },
      { participantId: 'third-b', userId: 'user-b1', fullName: 'B1', avatarUrl: null },
    ]);

    expect(grouped.get('third-a')).toEqual([
      { userId: 'user-a1', fullName: 'A1', avatarUrl: null },
      { userId: 'user-a2', fullName: 'A2', avatarUrl: 'a2.jpg' },
    ]);
    expect(grouped.get('third-b')).toEqual([
      { userId: 'user-b1', fullName: 'B1', avatarUrl: null },
    ]);
  });
});

describe('selectTopTournamentStandings', () => {
  it('returns one deterministic tournament-wide top four instead of restarting ranks per group', () => {
    const rows = selectTopTournamentStandings([
      { participantId: 'group-b-1', totalPoints: 7, pointsFor: 21, pointsAgainst: 8, won: 3 },
      { participantId: 'group-a-1', totalPoints: 9, pointsFor: 18, pointsAgainst: 10, won: 3 },
      { participantId: 'group-a-2', totalPoints: 8, pointsFor: 20, pointsAgainst: 12, won: 2 },
      { participantId: 'group-b-2', totalPoints: 6, pointsFor: 17, pointsAgainst: 9, won: 2 },
      { participantId: 'group-c-1', totalPoints: 5, pointsFor: 16, pointsAgainst: 11, won: 1 },
    ]);

    expect(rows.map((row) => row.participantId)).toEqual([
      'group-a-1',
      'group-a-2',
      'group-b-1',
      'group-b-2',
    ]);
  });

  it('deduplicates a participant that appears in more than one grouped row', () => {
    const rows = selectTopTournamentStandings([
      { participantId: 'same-team', totalPoints: 10, pointsFor: 20, pointsAgainst: 5, won: 4 },
      { participantId: 'same-team', totalPoints: 9, pointsFor: 18, pointsAgainst: 7, won: 3 },
      { participantId: 'other-team', totalPoints: 8, pointsFor: 16, pointsAgainst: 8, won: 2 },
    ]);

    expect(rows.map((row) => row.participantId)).toEqual(['same-team', 'other-team']);
  });
});
