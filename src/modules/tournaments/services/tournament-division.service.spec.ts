import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CreateDivisionDto, MatchType } from '../dto/create-division.dto';
import { UpdateDivisionDto } from '../dto/update-division.dto';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentCapacityService } from './tournament-capacity.service';
import { TournamentFeePolicyService } from './tournament-fee-policy.service';
import { TournamentDivisionService } from './tournament-division.service';

describe('TournamentDivisionService', () => {
  const repositoryMock = {
    findById: jest.fn(),
    findCategory: jest.fn(),
    findDivisionById: jest.fn(),
    createDivision: jest.fn(),
    updateDivision: jest.fn(),
    updateDivisionConfig: jest.fn(),
    hasStartedMatch: jest.fn(),
    findBracket: jest.fn(),
    getDivisionsByTournament: jest.fn(),
    getParticipantsByDivision: jest.fn(),
  };
  const accessMock = { isManager: jest.fn() };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const access = accessMock as unknown as TournamentAccessService;
  const fees = new TournamentFeePolicyService(repository);
  const divisions = new TournamentDivisionService(
    repository,
    access,
    fees,
    new TournamentCapacityService({} as never),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.findById.mockResolvedValue({
      id: 'tournament-1',
      categoryId: 'category-1',
      status: 'REGISTRATION_CLOSED',
    });
    repositoryMock.findDivisionById.mockResolvedValue({
      id: 'division-1',
      tournamentId: 'tournament-1',
      matchType: MatchType.SINGLES,
      genderRestriction: null,
    });
    repositoryMock.findCategory.mockResolvedValue({
      categoryConfig: null,
      name: 'Cầu lông',
      slug: 'cau-long',
    });
    repositoryMock.hasStartedMatch.mockResolvedValue(false);
    repositoryMock.findBracket.mockResolvedValue({ stages: [] });
    repositoryMock.updateDivision.mockImplementation(
      (_id, dto) => Promise.resolve(dto),
    );
    repositoryMock.updateDivisionConfig.mockImplementation(
      (_id, dto) => Promise.resolve(dto),
    );
    accessMock.isManager.mockResolvedValue(true);
  });

  it('allows switching to Open Doubles after registration closes before bracket creation', async () => {
    const dto = Object.assign(new UpdateDivisionDto(), {
      matchType: MatchType.DOUBLES,
      genderRestriction: null,
    });

    await divisions.updateDivision('division-1', dto, 'manager-1');

    expect(repositoryMock.updateDivision).toHaveBeenCalledWith(
      'division-1',
      dto,
      'manager-1',
    );
  });

  it('rejects division edits once the tournament bracket exists', async () => {
    repositoryMock.findBracket.mockResolvedValue({
      stages: [{ id: 'stage-1' }],
    });
    const dto = Object.assign(new UpdateDivisionDto(), { name: 'Updated' });

    await expect(
      divisions.updateDivision('division-1', dto, 'manager-1'),
    ).rejects.toThrow(
      'Không thể chỉnh sửa nội dung thi đấu sau khi sơ đồ thi đấu đã được tạo',
    );
    expect(repositoryMock.updateDivision).not.toHaveBeenCalled();
  });

  it('allows division edits when only another division has an active bracket', async () => {
    repositoryMock.findBracket.mockImplementation(
      (_tournamentId, divisionId) =>
        Promise.resolve({
          stages: divisionId === 'division-1' ? [] : [{ id: 'other-stage' }],
        }),
    );
    const dto = Object.assign(new UpdateDivisionDto(), { name: 'Updated' });

    await expect(
      divisions.updateDivision('division-1', dto, 'manager-1'),
    ).resolves.toEqual(dto);
  });

  it('rejects division edits after a tournament match has started', async () => {
    repositoryMock.hasStartedMatch.mockResolvedValue(true);
    const dto = Object.assign(new UpdateDivisionDto(), { name: 'Updated' });

    await expect(
      divisions.updateDivision('division-1', dto, 'manager-1'),
    ).rejects.toThrow(
      'Không thể chỉnh sửa nội dung thi đấu sau khi trận đấu đã bắt đầu',
    );
    expect(repositoryMock.updateDivision).not.toHaveBeenCalled();
  });

  it('scopes config bracket checks to the selected division', async () => {
    repositoryMock.findDivisionById.mockImplementation((divisionId) =>
      Promise.resolve({
        id: divisionId,
        tournamentId: 'tournament-1',
        matchType: MatchType.SINGLES,
        genderRestriction: null,
      }),
    );
    repositoryMock.findBracket.mockImplementation(
      (_tournamentId, divisionId) =>
        Promise.resolve({
          stages: divisionId === 'division-2' ? [{ id: 'stage-2' }] : [],
        }),
    );
    const dto = Object.assign(new UpdateDivisionDto(), { name: 'Updated' });

    await expect(
      divisions.updateDivisionConfig(
        'tournament-1',
        'division-1',
        dto,
        'manager-1',
      ),
    ).resolves.toEqual(dto);

    repositoryMock.updateDivisionConfig.mockClear();
    await expect(
      divisions.updateDivisionConfig(
        'tournament-1',
        'division-2',
        dto,
        'manager-1',
      ),
    ).rejects.toThrow(
      'Không thể cập nhật cấu hình nội dung sau khi sơ đồ thi đấu đã được tạo',
    );
    expect(repositoryMock.updateDivisionConfig).not.toHaveBeenCalled();
  });

  it('rejects config edits after a match has started', async () => {
    repositoryMock.hasStartedMatch.mockResolvedValue(true);
    const dto = Object.assign(new UpdateDivisionDto(), { name: 'Updated' });

    await expect(
      divisions.updateDivisionConfig(
        'tournament-1',
        'division-1',
        dto,
        'manager-1',
      ),
    ).rejects.toThrow(
      'Không thể cập nhật cấu hình nội dung sau khi trận đấu đã bắt đầu',
    );
    expect(repositoryMock.updateDivisionConfig).not.toHaveBeenCalled();
  });

  it('rejects config edits when the division belongs to another tournament', async () => {
    repositoryMock.findDivisionById.mockResolvedValue({
      id: 'division-1',
      tournamentId: 'tournament-2',
      matchType: MatchType.SINGLES,
      genderRestriction: null,
    });
    const dto = Object.assign(new UpdateDivisionDto(), { name: 'Updated' });

    await expect(
      divisions.updateDivisionConfig(
        'tournament-1',
        'division-1',
        dto,
        'manager-1',
      ),
    ).rejects.toThrow('Bảng đấu không tồn tại');
    expect(repositoryMock.updateDivisionConfig).not.toHaveBeenCalled();
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
