import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CommunitiesService } from './communities.service';
import { CommunitiesRepository } from './communities.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../../providers/storage/storage.service';

describe('CommunitiesService approval flow', () => {
  const userId = 'owner-user-id';
  const communityId = 'community-id';
  const categoryId = 'category-id';

  let service: CommunitiesService;
  let repository: jest.Mocked<CommunitiesRepository>;

  beforeEach(() => {
    repository = {
      countActiveByCreator: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      findMember: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<CommunitiesRepository>;

    service = new CommunitiesService(
      repository,
      {} as NotificationsService,
      {} as StorageService,
    );
  });

  it('creates a new club as PENDING', async () => {
    repository.countActiveByCreator.mockResolvedValue(0);
    repository.create.mockResolvedValue({
      id: communityId,
      status: 'PENDING',
    } as never);

    await service.create(userId, {
      name: 'Club approval test',
      categoryIds: [categoryId],
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorId: userId,
        status: 'PENDING',
      }),
      undefined,
      undefined,
      [categoryId],
    );
  });

  it('allows the owner to edit a rejected club and resubmit it', async () => {
    repository.findById.mockResolvedValue({
      id: communityId,
      creatorId: userId,
      status: 'REJECTED',
    } as never);
    repository.findMember.mockResolvedValue({
      status: 'JOINED',
      role: 'OWNER',
    } as never);
    repository.update.mockResolvedValue({
      id: communityId,
      status: 'PENDING',
    } as never);

    await service.resubmit(
      userId,
      communityId,
      { name: 'Updated club name' },
      [],
    );

    expect(repository.update).toHaveBeenCalledWith(
      communityId,
      expect.objectContaining({
        status: 'PENDING',
        rejectedReason: null,
        approvedBy: null,
        reviewedAt: null,
      }),
      undefined,
      undefined,
      undefined,
    );
  });

  it('does not resubmit a club that is still pending', async () => {
    repository.findById.mockResolvedValue({
      id: communityId,
      creatorId: userId,
      status: 'PENDING',
    } as never);

    await expect(
      service.resubmit(userId, communityId, { name: 'Duplicate request' }, []),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('does not let another user resubmit the rejected club', async () => {
    repository.findById.mockResolvedValue({
      id: communityId,
      creatorId: 'another-user-id',
      status: 'REJECTED',
    } as never);

    await expect(
      service.resubmit(userId, communityId, { name: 'Not my club' }, ['ADMIN']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('hides an unapproved club from an anonymous viewer', async () => {
    repository.findById.mockResolvedValue({
      id: communityId,
      creatorId: userId,
      status: 'PENDING',
    } as never);

    await expect(service.findById(communityId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
