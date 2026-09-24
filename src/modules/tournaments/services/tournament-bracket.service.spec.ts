import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { RedisService } from '../../../providers/redis/redis.service';
import type { CommunitySocialRepository } from '../../communities/community-social.repository';
import { BracketGeneratorService } from '../bracket-generator.service';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentBracketService } from './tournament-bracket.service';

describe('TournamentBracketService', () => {
  const repositoryMock = {
    findById: jest.fn(),
    getDivisionsByTournament: jest.fn(),
    findBracket: jest.fn(),
    findStageById: jest.fn(),
    updateStage: jest.fn(),
  };
  const accessMock = { isManager: jest.fn() };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const access = accessMock as unknown as TournamentAccessService;
  const bracketGenerator = {} as BracketGeneratorService;
  const bracket = new TournamentBracketService(
    repository,
    bracketGenerator,
    access,
    null as unknown as RedisService,
    null as unknown as CommunitySocialRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a division-specific bracket lookup when the division is absent', async () => {
    repositoryMock.findById.mockResolvedValue({ id: 'tournament-1' });
    repositoryMock.getDivisionsByTournament.mockResolvedValue([
      { id: 'division-1' },
    ]);

    await expect(
      bracket.findBracket('tournament-1', 'missing-division'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repositoryMock.findBracket).not.toHaveBeenCalled();
  });

  it('rejects stage updates from a non-manager before writing', async () => {
    repositoryMock.findStageById.mockResolvedValue({
      id: 'stage-1',
      tournamentId: 'tournament-1',
    });
    repositoryMock.findById.mockResolvedValue({
      id: 'tournament-1',
      createdBy: 'owner-1',
      communityId: null,
    });
    accessMock.isManager.mockResolvedValue(false);

    await expect(
      bracket.updateStage('stage-1', 'member-1', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repositoryMock.updateStage).not.toHaveBeenCalled();
  });
});
