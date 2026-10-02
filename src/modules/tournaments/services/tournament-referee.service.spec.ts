import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentRefereeService } from './tournament-referee.service';

const EMAIL_SHAPED = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const stringValues = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(stringValues);
  }
  return [];
};

describe('TournamentRefereeService', () => {
  const tournament = {
    id: 'tournament-1',
    name: 'Giai Cau Long Dong Nai',
    createdBy: 'owner-1',
  };
  // A co-organizer who is not the tournament owner. Inviter attribution is only
  // correct if it points at whoever actually pressed "send invitation", so the
  // two identities must stay distinguishable in every fixture.
  const invitingModeratorId = 'co-organizer-1';
  const invitingModeratorEmail = 'mai.hoang@example.test';
  const invitedReferee = {
    id: 'referee-user-1',
    email: 'minhduc@example.test',
    fullName: 'Tran Minh Duc',
  };
  const pendingInvite = {
    id: 'referee-invite-1',
    tournamentId: tournament.id,
    userId: invitedReferee.id,
    assignedBy: invitingModeratorId,
    status: 'INVITED',
  };

  const repositoryMock = {
    findById: jest.fn(),
    findUserByEmail: jest.fn(),
    findRefereeByTournamentAndUser: jest.fn(),
    addReferee: jest.fn(),
    findRefereeById: jest.fn(),
    updateRefereeStatus: jest.fn(),
    removeRefereeInvite: jest.fn(),
    findUserBasicById: jest.fn(),
    findReferees: jest.fn(),
  };
  const accessMock = { isManager: jest.fn() };
  const notificationsMock = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
    deleteByReceiverTypeAndRedirect: jest.fn().mockResolvedValue(undefined),
  };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const service = new TournamentRefereeService(
    repository,
    accessMock as unknown as TournamentAccessService,
    notificationsMock as unknown as NotificationsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    repositoryMock.findById.mockResolvedValue(tournament);
    accessMock.isManager.mockResolvedValue(true);
    repositoryMock.findUserByEmail.mockResolvedValue(invitedReferee);
    repositoryMock.findRefereeByTournamentAndUser.mockResolvedValue(null);
    repositoryMock.addReferee.mockResolvedValue(pendingInvite);
    repositoryMock.findRefereeById.mockResolvedValue(pendingInvite);
    repositoryMock.findUserBasicById.mockResolvedValue({
      id: invitedReferee.id,
      fullName: invitedReferee.fullName,
    });
  });

  it('attributes an invitation to the manager who sent it instead of the tournament owner', async () => {
    await service.addReferee(
      tournament.id,
      invitedReferee.email,
      invitingModeratorId,
    );

    expect(notificationsMock.sendNotification).toHaveBeenCalledTimes(1);
    const [invitation] = notificationsMock.sendNotification.mock.calls[0];
    expect(invitation.receiverId).toBe(invitedReferee.id);
    expect(invitation.senderId).toBe(invitingModeratorId);
    expect(invitation.senderId).not.toBe(tournament.createdBy);
  });

  it('never puts the inviter email into the invitation delivered to the referee', async () => {
    await service.addReferee(
      tournament.id,
      invitedReferee.email,
      invitingModeratorId,
    );

    const [invitation] = notificationsMock.sendNotification.mock.calls[0];
    const published = stringValues(invitation);
    expect(published.filter((value) => EMAIL_SHAPED.test(value))).toEqual([]);
    expect(published).not.toContain(invitingModeratorEmail);
  });

  it('withholds the referee list from a caller who does not manage the tournament', async () => {
    accessMock.isManager.mockResolvedValue(false);

    await expect(
      service.findReferees(tournament.id, 'unrelated-player'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repositoryMock.findReferees).not.toHaveBeenCalled();
  });

  it('refuses an invitation from a caller who does not manage the tournament', async () => {
    accessMock.isManager.mockResolvedValue(false);

    await expect(
      service.addReferee(tournament.id, invitedReferee.email, 'unrelated-player'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repositoryMock.addReferee).not.toHaveBeenCalled();
    expect(notificationsMock.sendNotification).not.toHaveBeenCalled();
  });

  it('refuses to withdraw a pending invitation for a caller who does not manage the tournament', async () => {
    accessMock.isManager.mockResolvedValue(false);

    await expect(
      service.revokeRefereeInvite(
        tournament.id,
        pendingInvite.id,
        'unrelated-player',
        [],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repositoryMock.removeRefereeInvite).not.toHaveBeenCalled();
    expect(notificationsMock.sendNotification).not.toHaveBeenCalled();
  });

  it('leaves a new referee pending until the invited referee responds', async () => {
    const invite = await service.addReferee(
      tournament.id,
      invitedReferee.email,
      invitingModeratorId,
    );

    expect(invite.status).toBe('INVITED');
    expect(repositoryMock.updateRefereeStatus).not.toHaveBeenCalled();
  });

  it('accepts an invitation once, and only for the referee who received it', async () => {
    let stored = { ...pendingInvite };
    repositoryMock.findRefereeById.mockImplementation(async () => stored);
    repositoryMock.updateRefereeStatus.mockImplementation(
      async (_refereeId: string, status: string) => {
        stored = { ...stored, status };
        return stored;
      },
    );

    await expect(
      service.respondToRefereeInvite(
        tournament.id,
        pendingInvite.id,
        invitedReferee.id,
        'ACCEPT',
      ),
    ).resolves.toMatchObject({ status: 'ACCEPTED' });

    await expect(
      service.respondToRefereeInvite(
        tournament.id,
        pendingInvite.id,
        'co-organizer-1',
        'ACCEPT',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.respondToRefereeInvite(
        tournament.id,
        pendingInvite.id,
        invitedReferee.id,
        'ACCEPT',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(stored.status).toBe('ACCEPTED');
  });

  it('no longer lets a manager withdraw an invitation the referee already accepted', async () => {
    repositoryMock.findRefereeById.mockResolvedValue({
      ...pendingInvite,
      status: 'ACCEPTED',
    });

    await expect(
      service.revokeRefereeInvite(
        tournament.id,
        pendingInvite.id,
        tournament.createdBy,
        [],
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repositoryMock.removeRefereeInvite).not.toHaveBeenCalled();
    expect(
      notificationsMock.deleteByReceiverTypeAndRedirect,
    ).not.toHaveBeenCalled();
  });
});
