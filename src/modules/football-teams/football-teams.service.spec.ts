import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FootballTeamsService } from './football-teams.service';

describe('FootballTeamsService permissions', () => {
  const repository = {
    findMember: jest.fn(),
    searchMemberCandidates: jest.fn(),
    updateMember: jest.fn(),
    removeMember: jest.fn(),
    cancelInvite: jest.fn(),
  };
  const notifications = { sendNotification: jest.fn() };
  const service = new FootballTeamsService(repository as never, notifications as never);

  beforeEach(() => jest.clearAllMocks());

  it('allows only an active captain or manager to search candidates', async () => {
    repository.findMember.mockResolvedValue({ status: 'ACTIVE', role: 'PLAYER' });

    await expect(service.searchMemberCandidates('actor', 'team', { q: 'an', limit: 10 }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.searchMemberCandidates).not.toHaveBeenCalled();
  });

  it('prevents a manager from promoting a member to captain', async () => {
    repository.findMember
      .mockResolvedValueOnce({ status: 'ACTIVE', role: 'MANAGER' })
      .mockResolvedValueOnce({ status: 'ACTIVE', role: 'PLAYER' });

    await expect(service.updateMember('actor', 'team', 'target', 'CAPTAIN'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.updateMember).not.toHaveBeenCalled();
  });

  it('prevents a manager from removing a captain', async () => {
    repository.findMember
      .mockResolvedValueOnce({ status: 'ACTIVE', role: 'MANAGER' })
      .mockResolvedValueOnce({ status: 'ACTIVE', role: 'CAPTAIN' });

    await expect(service.removeMember('actor', 'team', 'target'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.removeMember).not.toHaveBeenCalled();
  });

  it('rejects removing oneself through the manager endpoint', async () => {
    await expect(service.removeMember('actor', 'team', 'actor'))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});