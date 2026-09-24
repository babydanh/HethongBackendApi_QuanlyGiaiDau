import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from '../../notifications/notifications.service';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentParticipantAdminService } from './tournament-participant-admin.service';

describe('TournamentParticipantAdminService', () => {
  const repositoryMock = {
    findById: jest.fn(),
    findParticipantById: jest.fn(),
    findCompletedParticipantPayment: jest.fn(),
    markParticipantPaid: jest.fn(),
    findDivisionById: jest.fn(),
    updateParticipantStatus: jest.fn(),
    assignNextAvailableSeed: jest.fn(),
    getParticipantRosters: jest.fn(),
  };
  const accessMock = { isManager: jest.fn() };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const access = accessMock as unknown as TournamentAccessService;
  const admin = new TournamentParticipantAdminService(
    repository,
    access,
    null as unknown as NotificationsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects unsupported participant status before loading the participant', async () => {
    repositoryMock.findById.mockResolvedValue({
      id: 'tournament-1',
      status: 'REGISTRATION_OPEN',
    });
    accessMock.isManager.mockResolvedValue(true);

    await expect(
      admin.updateParticipantStatus(
        'tournament-1',
        'participant-1',
        'PENDING',
        'organizer-1',
        [],
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repositoryMock.findParticipantById).not.toHaveBeenCalled();
  });

  it('requires a completed payment before approving a paid participant', async () => {
    const tournament = {
      id: 'tournament-1',
      status: 'REGISTRATION_OPEN',
      entryFee: 500,
      name: 'Regional event',
    };
    const participant = {
      id: 'participant-1',
      tournamentId: 'tournament-1',
      tournamentDivisionId: null,
      teamStatus: 'PENDING_APPROVAL',
      isPaid: false,
      entryFeeAtRegistration: 500,
    };
    repositoryMock.findById.mockResolvedValue(tournament);
    accessMock.isManager.mockResolvedValue(true);
    repositoryMock.findParticipantById.mockResolvedValue(participant);
    repositoryMock.findCompletedParticipantPayment.mockResolvedValue({
      id: 'payment-1',
    });
    repositoryMock.updateParticipantStatus.mockResolvedValue({
      ...participant,
      teamStatus: 'COMPLETE',
    });
    repositoryMock.assignNextAvailableSeed.mockResolvedValue(null);
    repositoryMock.getParticipantRosters.mockResolvedValue([]);
    const broadcast = jest.fn();

    await admin.updateParticipantStatus(
      'tournament-1',
      'participant-1',
      'COMPLETE',
      'organizer-1',
      [],
      broadcast,
    );

    expect(repositoryMock.markParticipantPaid).toHaveBeenCalledWith(
      'participant-1',
    );
    expect(repositoryMock.updateParticipantStatus).toHaveBeenCalledWith(
      'participant-1',
      'COMPLETE',
    );
    expect(broadcast).toHaveBeenCalledWith('tournament-1', {
      participantId: 'participant-1',
      divisionId: null,
      action: 'APPROVED',
    });
  });
});
