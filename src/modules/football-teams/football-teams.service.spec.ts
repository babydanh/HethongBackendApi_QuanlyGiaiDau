import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FootballTeamsService } from './football-teams.service';

describe('FootballTeamsService permissions', () => {
  const repository = {
    findById: jest.fn(),
    findMember: jest.fn(),
    invite: jest.fn(),
    respond: jest.fn(),
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

  it('sends an invite only after a captain/manager permission check', async () => {
    repository.findMember.mockResolvedValue({ status: 'ACTIVE', role: 'CAPTAIN' });
    repository.findById.mockResolvedValue({ id: 'team', name: 'FC Test', members: [] });
    repository.invite.mockResolvedValue({ id: 'membership', invitedBy: 'actor' });

    await expect(service.invite('actor', 'team', { userId: 'target', role: 'PLAYER' }))
      .resolves.toEqual({ id: 'membership', invitedBy: 'actor' });
    expect(repository.invite).toHaveBeenCalledWith('team', 'actor', 'target', 'PLAYER');
    expect(notifications.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('notifies the inviter after an accepted team invitation', async () => {
    repository.findById.mockResolvedValue({ id: 'team', name: 'FC Test', members: [] });
    repository.respond.mockResolvedValue({ invitedBy: 'captain', status: 'ACTIVE' });

    await expect(service.respond('target', 'team', 'ACCEPTED'))
      .resolves.toEqual({ invitedBy: 'captain', status: 'ACTIVE' });
    expect(repository.respond).toHaveBeenCalledWith('team', 'target', 'ACCEPTED');
    expect(notifications.sendNotification).toHaveBeenCalledTimes(1);
  });
});
