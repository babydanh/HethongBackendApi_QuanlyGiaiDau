import { ForbiddenException } from '@nestjs/common';
import { CreateParentTournamentDto } from '../dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from '../dto/update-parent-tournament.dto';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentLifecycleService } from './tournament-lifecycle.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { CommunitySocialRepository } from '../../communities/community-social.repository';
import type { RedisService } from '../../../providers/redis/redis.service';
import type { TournamentMediaService } from './tournament-media.service';
import type { TournamentFeePolicyService } from './tournament-fee-policy.service';

describe('TournamentLifecycleService parent operations', () => {
  const repositoryMock = {
    createParent: jest.fn(),
    findParentById: jest.fn(),
    updateParent: jest.fn(),
  };
  const accessMock = {
    isSystemTournamentCreator: jest.fn(),
    isManager: jest.fn(),
  };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const access = accessMock as unknown as TournamentAccessService;
  const lifecycle = new TournamentLifecycleService(
    repository,
    access,
    null as unknown as NotificationsService,
    null as unknown as CommunitySocialRepository,
    null as unknown as RedisService,
    null as unknown as TournamentMediaService,
    null as unknown as TournamentFeePolicyService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects non-organizer parent creation before persistence', async () => {
    accessMock.isSystemTournamentCreator.mockReturnValue(false);
    const dto = { name: 'Regional series' } as CreateParentTournamentDto;

    await expect(
      lifecycle.createParent('user-1', dto, ['PLAYER']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repositoryMock.createParent).not.toHaveBeenCalled();
  });

  it('allows a manager to update a parent tournament', async () => {
    const existing = { id: 'parent-1', createdBy: 'user-1' };
    const dto = { name: 'Updated series' } as UpdateParentTournamentDto;
    repositoryMock.findParentById.mockResolvedValue(existing);
    accessMock.isManager.mockResolvedValue(true);
    repositoryMock.updateParent.mockResolvedValue({ ...existing, ...dto });

    await expect(
      lifecycle.updateParent('parent-1', 'user-1', dto),
    ).resolves.toEqual({ ...existing, ...dto });
    expect(repositoryMock.updateParent).toHaveBeenCalledWith(
      'parent-1',
      'user-1',
      dto,
    );
  });
});
