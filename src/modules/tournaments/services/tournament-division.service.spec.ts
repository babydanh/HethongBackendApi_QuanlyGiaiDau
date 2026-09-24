import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CreateDivisionDto, MatchType } from '../dto/create-division.dto';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentFeePolicyService } from './tournament-fee-policy.service';
import { TournamentDivisionService } from './tournament-division.service';

describe('TournamentDivisionService', () => {
  const repositoryMock = {
    findById: jest.fn(),
    findCategory: jest.fn(),
    createDivision: jest.fn(),
    getDivisionsByTournament: jest.fn(),
    getParticipantsByDivision: jest.fn(),
  };
  const accessMock = { isManager: jest.fn() };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const access = accessMock as unknown as TournamentAccessService;
  const fees = new TournamentFeePolicyService(repository);
  const divisions = new TournamentDivisionService(repository, access, fees);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a non-manager before division creation', async () => {
    repositoryMock.findById.mockResolvedValue({
      id: 'tournament-1',
      categoryId: 'category-1',
    });
    accessMock.isManager.mockResolvedValue(false);
    const dto = Object.assign(new CreateDivisionDto(), {
      name: 'Open',
      matchType: MatchType.SINGLES,
    });

    await expect(
      divisions.createDivision('tournament-1', dto, 'member-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repositoryMock.createDivision).not.toHaveBeenCalled();
    expect(repositoryMock.findCategory).not.toHaveBeenCalled();
  });

  it('does not return division participants for an unknown division', async () => {
    repositoryMock.getDivisionsByTournament.mockResolvedValue([
      { id: 'division-1' },
    ]);

    await expect(
      divisions.getParticipantsByDivision('tournament-1', 'missing-division'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repositoryMock.getParticipantsByDivision).not.toHaveBeenCalled();
  });
});
