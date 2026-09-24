import { ForbiddenException } from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';

describe('TournamentAccessService', () => {
  const repository = {
    isCoOrganizer: jest.fn().mockResolvedValue(false),
    findCommunityById: jest.fn().mockResolvedValue(null),
    findCommunityMember: jest.fn().mockResolvedValue(null),
  } as unknown as TournamentsRepository;
  const access = new TournamentAccessService(repository);
  const tournament = {
    id: 'tournament-1',
    createdBy: 'owner-1',
    communityId: 'community-1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository.isCoOrganizer = jest.fn().mockResolvedValue(false);
    repository.findCommunityById = jest.fn().mockResolvedValue(null);
    repository.findCommunityMember = jest.fn().mockResolvedValue(null);
  });

  it('allows the tournament owner and a system administrator', async () => {
    await expect(access.isManager(tournament, 'owner-1')).resolves.toBe(true);
    await expect(access.isManager(tournament, 'member-1', ['ADMIN'])).resolves.toBe(
      true,
    );
  });

  it('allows an active community moderator but not an ordinary member', async () => {
    repository.findCommunityMember = jest
      .fn()
      .mockResolvedValueOnce({ status: 'ACTIVE', role: 'moderator' })
      .mockResolvedValueOnce({ status: 'JOINED', role: 'MEMBER' });

    await expect(access.isManager(tournament, 'moderator-1')).resolves.toBe(true);
    await expect(access.isManager(tournament, 'member-1')).resolves.toBe(false);
  });

  it('keeps the system creator role boundary and community creator policy', async () => {
    expect(access.isSystemTournamentCreator(['ORGANIZER'])).toBe(true);
    expect(access.isSystemTournamentCreator(['ADMIN'])).toBe(true);
    expect(access.isSystemTournamentCreator(['PLAYER'])).toBe(false);

    repository.findCommunityMember = jest
      .fn()
      .mockResolvedValueOnce({ status: 'JOINED', role: 'OWNER' })
      .mockResolvedValueOnce({ status: 'JOINED', role: 'MEMBER' });

    await expect(
      access.assertCommunityTournamentCreator('community-1', 'owner-1'),
    ).resolves.toBeUndefined();
    await expect(
      access.assertCommunityTournamentCreator('community-1', 'member-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
