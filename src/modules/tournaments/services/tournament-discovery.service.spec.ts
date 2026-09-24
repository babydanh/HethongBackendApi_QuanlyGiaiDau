import { ForbiddenException } from '@nestjs/common';
import type { RedisService } from '../../../providers/redis/redis.service';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentDiscoveryService } from './tournament-discovery.service';

describe('TournamentDiscoveryService', () => {
  const tournament = () => ({
    id: 'tournament-1',
    createdBy: 'owner-1',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    tournamentType: 'PUBLIC',
    inviteCode: 'private-code',
    tournamentConfig: {},
  });
  const repositoryMock = {
    findById: jest.fn(),
    findParticipantById: jest.fn(),
    findCommunityMember: jest.fn(),
    isUserParticipant: jest.fn(),
  };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const access = {
    isManager: jest.fn(),
  } as unknown as TournamentAccessService;
  const discovery = new TournamentDiscoveryService(
    repository,
    null as unknown as RedisService,
    access,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.findById.mockImplementation(async () => tournament());
    repositoryMock.findParticipantById.mockResolvedValue(null);
    repositoryMock.findCommunityMember.mockResolvedValue(null);
    repositoryMock.isUserParticipant.mockResolvedValue(false);
    access.isManager = jest.fn().mockResolvedValue(false);
  });

  it('hides invite codes from non-owner public viewers and preserves them for owners', async () => {
    const publicView = await discovery.findOne('tournament-1', 'viewer-1');
    const ownerView = await discovery.findOne('tournament-1', 'owner-1');

    expect(publicView.inviteCode).toBeNull();
    expect(ownerView.inviteCode).toBe('private-code');
  });

  it('rejects private tournament access without a valid invite', async () => {
    repositoryMock.findById.mockImplementation(async () => ({
      ...tournament(),
      visibility: 'PRIVATE',
    }));

    await expect(
      discovery.findOne('tournament-1', 'viewer-1', 'wrong-code'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
