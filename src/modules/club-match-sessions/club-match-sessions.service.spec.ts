import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ClubMatchSessionsService } from './club-match-sessions.service';

describe('ClubMatchSessionsService', () => {
  const repository = {
    findCommunityContext: jest.fn(),
    createSession: jest.fn(),
    findSession: jest.fn(),
    findSessionByCreationKey: jest.fn(),
    findMembership: jest.fn(),
    findParticipant: jest.fn(),
    findPreference: jest.fn(),
  };
  const gateway = { broadcastClubSessionMatchUpdate: jest.fn() };
  const processor = {
    dispatchNow: jest.fn(),
    setClubMatchUpdatePublisher: jest.fn(),
  };
  const rankingsService = {};
  const tournamentsService = { createLite: jest.fn(), remove: jest.fn() };
  let service: ClubMatchSessionsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ClubMatchSessionsService(
      repository as never,
      gateway as never,
      processor as never,
      rankingsService as never,
      tournamentsService as never,
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
    repository.findParticipant.mockResolvedValue(null);
    repository.findPreference.mockResolvedValue(null);

    const result = await service.create(
      { id: 'owner-1', roles: [] },
      { communityId: 'community-1' },
      'en',
    );

    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationMode: 'MIXED',
        isRanked: true,
        maxParticipants: 16,
        sessionConfig: {},
        startAt: null,
        endAt: null,
      }),
    );
    expect(result).toMatchObject({
      resolvedName: 'Social match session Riverside Club',
      capabilities: { bracket: false, pairingMode: 'FREE' },
    });
  });

  it('stores a Lite-compatible recurring schedule without creating a bracket', async () => {
    repository.findCommunityContext.mockResolvedValue({
      id: 'community-1',
      name: 'Riverside Club',
      status: 'ACTIVE',
      categoryId: 'category-1',
      memberRole: 'OWNER',
      memberStatus: 'JOINED',
    });
    repository.createSession.mockResolvedValue({ id: 'session-recurring' });
    repository.findSession.mockResolvedValue({
      session: {
        id: 'session-recurring',
        communityId: 'community-1',
        categoryId: 'category-1',
        name: 'Thứ bảy giao lưu',
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
    repository.findParticipant.mockResolvedValue(null);
    repository.findPreference.mockResolvedValue(null);

    await service.create(
      { id: 'owner-1', roles: [] },
      {
        communityId: 'community-1',
        name: 'Thứ bảy giao lưu',
        isRecurring: true,
        recurringFrequency: 'WEEKLY',
        recurringDaysOfWeek: [6],
        recurringTimeOfDay: '18:00',
        recurringAdvanceDays: 3,
      },
      'vi',
    );

    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationMode: 'MIXED',
        isRanked: true,
        maxParticipants: 16,
        sessionConfig: {
          recurring: expect.objectContaining({
            enabled: true,
            frequency: 'WEEKLY',
            daysOfWeek: [6],
            timeOfDay: '18:00',
            advanceDays: 3,
          }),
        },
        startAt: expect.any(Date),
        endAt: expect.any(Date),
      }),
    );
  });

  it('creates one linked Lite tournament for bracket mode', async () => {
    repository.findCommunityContext.mockResolvedValue({
      id: 'community-1',
      name: 'Riverside Club',
      status: 'ACTIVE',
      categoryId: 'category-1',
      categorySlug: 'pickleball',
      memberRole: 'ADMIN',
      memberStatus: 'JOINED',
    });
    tournamentsService.createLite.mockResolvedValue({ id: 'tournament-1' });
    repository.createSession.mockResolvedValue({ id: 'session-bracket-1' });
    repository.findSession.mockResolvedValue({
      session: {
        id: 'session-bracket-1',
        communityId: 'community-1',
        categoryId: 'category-1',
        name: 'Giải giao lưu CLB',
        pairingMode: 'BRACKET',
        bracketTournamentId: 'tournament-1',
        isRanked: true,
      },
      communityName: 'Riverside Club',
      categoryName: 'Pickleball',
      categorySlug: 'pickleball',
      categoryConfig: {},
    });
    repository.findMembership.mockResolvedValue({
      role: 'ADMIN',
      status: 'JOINED',
    });
    repository.findParticipant.mockResolvedValue(null);
    repository.findPreference.mockResolvedValue(null);

    const startAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const result = await service.create(
      { id: 'admin-1', roles: [] },
      {
        communityId: 'community-1',
        name: 'Giải giao lưu CLB',
        pairingMode: 'BRACKET',
        format: 'doubles',
        bracketType: 'group_stage_knockout',
        startAt: startAt.toISOString(),
      },
      'vi',
    );

    expect(tournamentsService.createLite).toHaveBeenCalledWith(
      'admin-1',
      expect.objectContaining({
        communityId: 'community-1',
        tournamentType: 'CLUB',
        visibility: 'PRIVATE',
        sport: 'pickleball',
        format: 'doubles',
        bracketType: 'group_stage_knockout',
        maxTeams: 16,
        registrationMode: 'OPEN',
      }),
      [],
    );
    expect(repository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        pairingMode: 'BRACKET',
        bracketTournamentId: 'tournament-1',
        publishAnnouncement: false,
      }),
    );
    expect(result).toMatchObject({
      capabilities: {
        bracket: true,
        pairingMode: 'BRACKET',
        bracketTournamentId: 'tournament-1',
      },
    });
  });

  it('replays a bracket creation request without creating a second tournament', async () => {
    repository.findCommunityContext.mockResolvedValue({
      id: 'community-1',
      name: 'Riverside Club',
      status: 'ACTIVE',
      categoryId: 'category-1',
      categorySlug: 'pickleball',
      memberRole: 'ADMIN',
      memberStatus: 'JOINED',
    });
    repository.findSessionByCreationKey.mockResolvedValue({
      id: 'session-existing',
      communityId: 'community-1',
      creationFingerprint: null,
    });
    repository.findSession.mockResolvedValue({
      session: {
        id: 'session-existing',
        communityId: 'community-1',
        categoryId: 'category-1',
        name: 'Giải giao lưu CLB',
        pairingMode: 'BRACKET',
        bracketTournamentId: 'tournament-existing',
        status: 'OPEN',
        startAt: null,
        endAt: null,
        registrationOpenAt: new Date(),
        registrationClosedAt: null,
        endedAt: null,
        isRanked: true,
      },
      communityName: 'Riverside Club',
      categoryName: 'Pickleball',
      categorySlug: 'pickleball',
      categoryConfig: {},
      bracketTournament: null,
    });
    repository.findMembership.mockResolvedValue({
      role: 'ADMIN',
      status: 'JOINED',
    });
    repository.findParticipant.mockResolvedValue(null);
    repository.findPreference.mockResolvedValue(null);

    const result = await service.create(
      { id: 'admin-1', roles: [] },
      {
        communityId: 'community-1',
        name: 'Giải giao lưu CLB',
        pairingMode: 'BRACKET',
        startAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
      },
      'vi',
      'create-key-1',
    );

    expect(result.id).toBe('session-existing');
    expect(tournamentsService.createLite).not.toHaveBeenCalled();
    expect(repository.createSession).not.toHaveBeenCalled();
  });

  it('projects bracket lifecycle from the linked tournament', async () => {
    repository.findCommunityContext.mockResolvedValue({
      id: 'community-1',
      status: 'ACTIVE',
      memberRole: 'MEMBER',
      memberStatus: 'JOINED',
    });
    repository.findSession.mockResolvedValue({
      session: {
        id: 'session-bracket',
        communityId: 'community-1',
        categoryId: 'category-1',
        name: 'Giải giao lưu CLB',
        pairingMode: 'BRACKET',
        bracketTournamentId: 'tournament-1',
        status: 'OPEN',
        startAt: new Date(Date.now() + 60 * 60 * 1000),
        endAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        registrationOpenAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        registrationClosedAt: null,
        endedAt: null,
        isRanked: true,
      },
      communityName: 'Riverside Club',
      categoryName: 'Pickleball',
      categorySlug: 'pickleball',
      categoryConfig: {},
      bracketTournament: {
        id: 'tournament-1',
        status: 'COMPLETED',
        registrationStartDate: new Date(Date.now() - 4 * 60 * 60 * 1000),
        registrationEndDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
        startDate: new Date(Date.now() - 90 * 60 * 1000),
        endDate: new Date(Date.now() - 30 * 60 * 1000),
        isRegistrationLocked: true,
      },
    });
    repository.findMembership.mockResolvedValue({ role: 'MEMBER', status: 'JOINED' });
    repository.findParticipant.mockResolvedValue(null);
    repository.findPreference.mockResolvedValue(null);

    const result = await service.get('session-bracket', {
      id: 'member-1',
      roles: [],
    });

    expect(result).toMatchObject({
      status: 'ENDED',
      startAt: expect.any(Date),
      endAt: expect.any(Date),
      capabilities: {
        bracket: true,
        canJoin: false,
        canWithdraw: false,
        canCreateMatch: false,
      },
    });
  });

  it('rejects a raced idempotency key when the winning request has another payload', async () => {
    repository.findCommunityContext.mockResolvedValue({
      id: 'community-1',
      name: 'Riverside Club',
      status: 'ACTIVE',
      categoryId: 'category-1',
      categorySlug: 'pickleball',
      memberRole: 'ADMIN',
      memberStatus: 'JOINED',
    });
    tournamentsService.createLite.mockResolvedValue({ id: 'duplicate-tournament' });
    repository.createSession.mockResolvedValue({
      id: 'session-existing',
      bracketTournamentId: null,
      creationFingerprint: 'fingerprint-from-another-request',
    });

    await expect(
      service.create(
        { id: 'admin-1', roles: [] },
        {
          communityId: 'community-1',
          pairingMode: 'BRACKET',
          startAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        },
        'vi',
        'raced-key-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tournamentsService.remove).toHaveBeenCalledWith(
      'duplicate-tournament',
      'admin-1',
      [],
    );
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
