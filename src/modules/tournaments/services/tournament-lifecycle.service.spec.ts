import { ForbiddenException } from '@nestjs/common';
import { CreateParentTournamentDto } from '../dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from '../dto/update-parent-tournament.dto';
import { TournamentsRepository } from '../tournaments.repository';
import { CreateTournamentDto } from '../dto/create-tournament.dto';
import { UpdateTournamentDto } from '../dto/update-tournament.dto';

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
    findByParentId: jest.fn(),
    updateParent: jest.fn(),
  };

  const accessMock = {
    isSystemTournamentCreator: jest.fn(),
    isManager: jest.fn(),
  };
  const feePolicyMock = {
    assertEntryFeeAllowed: jest.fn(),
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
    feePolicyMock as unknown as TournamentFeePolicyService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a paid club tournament before Lite persistence', async () => {
    await expect(
      lifecycle.assertLiteCreateAllowed('user-1', {
        tournamentType: 'CLUB',
        entryFee: 1000,
      } as CreateTournamentDto),
    ).rejects.toThrow('Giải đấu của câu lạc bộ phải miễn phí');
    expect(feePolicyMock.assertEntryFeeAllowed).toHaveBeenCalledWith(1000);
  });

  it('restricts Lite child creation to a manager of the parent', async () => {
    repositoryMock.findParentById.mockResolvedValue({
      id: 'parent-1',
      createdBy: 'owner-1',
    });
    accessMock.isManager.mockResolvedValue(false);

    await expect(
      lifecycle.assertLiteCreateAllowed(
        'user-2',
        {
          tournamentType: 'PUBLIC',
          parentId: 'parent-1',
          matchType: 'SINGLES',
        } as CreateTournamentDto,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repositoryMock.findByParentId).not.toHaveBeenCalled();
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

interface ClosedTournamentFixture {
  id: string;
  createdBy: string;
  status: string;
  isRegistrationLocked: boolean;
  registrationStartDate: Date;
  registrationEndDate: Date;
  startDate: Date;
  endDate: Date;
  categoryId: string;
  tournamentConfig: {
    registrationMode: string;
    doublesPairingMode: string;
  };
  matchType: string;
  genderRestriction: string;
  entryFee: number;
  tournamentType: string;
  visibility: string;
  platformFeePercentage: number;
  isRanked: boolean;
}

describe('TournamentLifecycleService registration deadline extensions', () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const repositoryMock = {
    findById: jest.fn(),
    findByParentId: jest.fn(),
    findCategory: jest.fn(),
    update: jest.fn(),
    getFollowerUserIds: jest.fn(),
  };
  const accessMock = { isManager: jest.fn() };
  const feePolicyMock = { assertEntryFeeAllowed: jest.fn() };
  const lifecycle = new TournamentLifecycleService(
    repositoryMock as unknown as TournamentsRepository,
    accessMock as unknown as TournamentAccessService,
    null as unknown as NotificationsService,
    null as unknown as CommunitySocialRepository,
    null as unknown as RedisService,
    null as unknown as TournamentMediaService,
    feePolicyMock as unknown as TournamentFeePolicyService,
  );

  function makeClosedTournament(): ClosedTournamentFixture {
    const now = Date.now();
    return {
      id: 'tournament-1',
      createdBy: 'organizer-1',
      status: 'REGISTRATION_CLOSED',
      isRegistrationLocked: false,
      registrationStartDate: new Date(now - 10 * dayMs),
      registrationEndDate: new Date(now - dayMs),
      startDate: new Date(now + 10 * dayMs),
      endDate: new Date(now + 12 * dayMs),
      categoryId: 'category-1',
      tournamentConfig: {
        registrationMode: 'OPEN',
        doublesPairingMode: 'ORGANIZER',
      },
      matchType: 'SINGLES',
      genderRestriction: 'MALE',
      entryFee: 0,
      tournamentType: 'PUBLIC',
      visibility: 'PUBLIC',
      platformFeePercentage: 0,
      isRanked: true,
    };
  }

  function prepareUpdate(existing: ClosedTournamentFixture) {
    repositoryMock.findById.mockResolvedValue(existing);
    repositoryMock.findCategory.mockResolvedValue({
      id: 'category-1',
      name: 'Badminton',
      slug: 'badminton',
      categoryConfig: null,
    });
    repositoryMock.getFollowerUserIds.mockResolvedValue([]);
    accessMock.isManager.mockResolvedValue(true);
    feePolicyMock.assertEntryFeeAllowed.mockResolvedValue(undefined);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extends an expired deadline without reopening registration', async () => {
    const existing = makeClosedTournament();
    const extendedDeadline = new Date(Date.now() + 5 * dayMs);
    prepareUpdate(existing);
    repositoryMock.update.mockResolvedValue({
      ...existing,
      registrationEndDate: extendedDeadline,
    });

    await lifecycle.update(
      existing.id,
      'organizer-1',
      {
        registrationEndDate: extendedDeadline.toISOString(),
      } as UpdateTournamentDto,
    );

    expect(repositoryMock.update).toHaveBeenCalledWith(
      existing.id,
      'organizer-1',
      { registrationEndDate: extendedDeadline.toISOString() },
    );
  });

  it('does not accept a non-extension or other locked registration changes', async () => {
    const existing = makeClosedTournament();
    prepareUpdate(existing);

    await expect(
      lifecycle.update(
        existing.id,
        'organizer-1',
        {
          registrationEndDate: new Date(Date.now() - 2 * dayMs).toISOString(),
          maxParticipants: 20,
        } as UpdateTournamentDto,
      ),
    ).rejects.toThrow();
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it('keeps a manual registration lock closed even for a later deadline', async () => {
    const existing = {
      ...makeClosedTournament(),
      isRegistrationLocked: true,
    };
    const laterDeadline = new Date(Date.now() + 5 * dayMs);
    prepareUpdate(existing);

    await expect(
      lifecycle.update(
        existing.id,
        'organizer-1',
        {
          registrationEndDate: laterDeadline.toISOString(),
        } as UpdateTournamentDto,
      ),
    ).rejects.toThrow();
    expect(repositoryMock.update).not.toHaveBeenCalled();
  });
  it('rejects deadline propagation when a sibling registration is manually locked', async () => {
    const existing = { ...makeClosedTournament(), parentId: 'parent-1' };
    const lockedSibling = {
      ...makeClosedTournament(),
      id: 'tournament-2',
      parentId: 'parent-1',
      isRegistrationLocked: true,
    };
    const extendedDeadline = new Date(Date.now() + 5 * dayMs);
    prepareUpdate(existing);
    repositoryMock.findByParentId.mockResolvedValue([existing, lockedSibling]);

    await expect(
      lifecycle.update(
        existing.id,
        'organizer-1',
        {
          registrationEndDate: extendedDeadline.toISOString(),
        } as UpdateTournamentDto,
      ),
    ).rejects.toThrow();

    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

  it('rejects deadline propagation that would shorten a closed sibling deadline', async () => {
    const existing = { ...makeClosedTournament(), parentId: 'parent-1' };
    const siblingDeadline = new Date(Date.now() + 2 * dayMs);
    const closedSibling = {
      ...makeClosedTournament(),
      id: 'tournament-2',
      parentId: 'parent-1',
      registrationEndDate: siblingDeadline,
    };
    const requestedDeadline = new Date(Date.now() + dayMs);
    prepareUpdate(existing);
    repositoryMock.findByParentId.mockResolvedValue([existing, closedSibling]);

    await expect(
      lifecycle.update(
        existing.id,
        'organizer-1',
        {
          registrationEndDate: requestedDeadline.toISOString(),
        } as UpdateTournamentDto,
      ),
    ).rejects.toThrow();

    expect(repositoryMock.update).not.toHaveBeenCalled();
  });

});
