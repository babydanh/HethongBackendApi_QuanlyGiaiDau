import { NotFoundException } from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentResultsService } from './tournament-results.service';

describe('TournamentResultsService', () => {
  const repositoryMock = {
    findById: jest.fn(),
    findGroupStandings: jest.fn(),
    findTournamentResultMatches: jest.fn(),
    findPublicTournamentResultMembers: jest.fn(),
  };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const results = new TournamentResultsService(repository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects standings for a missing tournament', async () => {
    repositoryMock.findById.mockResolvedValue(null);

    await expect(
      results.getGroupStandings('missing-tournament'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ranks standings tournament-wide instead of restarting ranks per group', async () => {
    repositoryMock.findById.mockResolvedValue({
      id: 'tournament-1',
      status: 'IN_PROGRESS',
      tournamentConfig: {},
    });
    repositoryMock.findTournamentResultMatches.mockResolvedValue([]);
    repositoryMock.findGroupStandings.mockResolvedValue([
      {
        participantId: 'team-b',
        teamName: 'Beta',
        totalPoints: 2,
        pointsFor: 10,
        pointsAgainst: 5,
        won: 1,
      },
      {
        participantId: 'team-a',
        teamName: 'Alpha',
        totalPoints: 8,
        pointsFor: 15,
        pointsAgainst: 2,
        won: 3,
      },
    ]);
    repositoryMock.findPublicTournamentResultMembers.mockResolvedValue([]);

    const result = await results.getTournamentResultsV2('tournament-1');

    expect(result.awards.map((award) => award.participant?.participantId)).toEqual([
      'team-a',
      'team-b',
    ]);
    expect(result.awards.map((award) => award.rank)).toEqual([1, 2]);
    expect(result.finalized).toBe(false);
  });
});
