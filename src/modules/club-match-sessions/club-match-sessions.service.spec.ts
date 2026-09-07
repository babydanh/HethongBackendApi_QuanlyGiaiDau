import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClubMatchSessionsService } from './club-match-sessions.service';

describe('ClubMatchSessionsService', () => {
  const repository = {
    findCommunityContext: jest.fn(),
    createSession: jest.fn(),
    findSession: jest.fn(),
    findMembership: jest.fn(),
  };
  const gateway = { broadcastClubSessionMatchUpdate: jest.fn() };
  const processor = { dispatchNow: jest.fn() };
  let service: ClubMatchSessionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ClubMatchSessionsService(
      repository as never,
      gateway as never,
      processor as never,
    );
  });

  it('creates an immediately-open ranked free-pair session by default', async () => {
    repository.findCommunityContext.mockResolvedValue({
      id: 'community-1',
      name: 'Riverside Club',
      status: 'ACTIVE',
      categoryId: 'category-1',
      memberRole: 'OWNER',
      memberStatus: 'JOINED',
    });
    repository.createSession.mockResolvedValue({ id: 'session-1' });
    repository.findSession.mockResolvedValue({
      session: {
        id: 'session-1',
        communityId: 'community-1',
        categoryId: 'category-1',
        name: null,
        pairingMode: 'FREE',
        isRanked: true,
      },
      communityName: 'Riverside Club',
      categoryName: 'Pickleball',
      categorySlug: 'pickleball',
      categoryConfig: {},
    });
    repository.findMembership.mockResolvedValue({
      role: 'OWNER',
      status: 'JOINED',
    });

    const result = await service.create(
      { id: 'owner-1', roles: [] },
      { communityId: 'community-1' },
      'en',
    );

    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationMode: 'MIXED',
        isRanked: true,
        startAt: null,
        endAt: null,
      }),
    );
    expect(result).toMatchObject({
      resolvedName: 'Club social match session Riverside Club',
      capabilities: { bracket: false, pairingMode: 'FREE' },
    });
  });

  it('rejects a joined non-manager creating a session', async () => {
    repository.findCommunityContext.mockResolvedValue({
      id: 'community-1',
      status: 'ACTIVE',
      categoryId: 'category-1',
      memberRole: 'MEMBER',
      memberStatus: 'JOINED',
    });

    await expect(
      service.create(
        { id: 'member-1', roles: [] },
        { communityId: 'community-1' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it('requires an idempotency key for forced participation', async () => {
    await expect(
      service.forceParticipants(
        'session-1',
        { id: 'owner-1', roles: [] },
        { userIds: ['user-1'] },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.findSession).not.toHaveBeenCalled();
  });

  it('rejects a session category that differs from the club sport', async () => {
    repository.findCommunityContext.mockResolvedValue({
      id: 'community-1',
      status: 'ACTIVE',
      categoryId: 'category-1',
      memberRole: 'MODERATOR',
      memberStatus: 'JOINED',
    });

    await expect(
      service.create(
        { id: 'moderator-1', roles: [] },
        { communityId: 'community-1', categoryId: 'category-2' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
