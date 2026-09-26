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
  it('approves an approval-mode one-player double into the pairing queue', async () => {
    const tournament = {
      id: 'tournament-1',
      status: 'REGISTRATION_OPEN',
      name: 'Regional event',
      entryFee: 500,
      matchType: 'DOUBLES',
      tournamentConfig: { registrationMode: 'APPROVAL' },
    };
    const participant = {
      id: 'participant-1',
      tournamentId: 'tournament-1',
      tournamentDivisionId: 'division-1',
      teamStatus: 'PENDING_APPROVAL',
      isPaid: false,
      entryFeeAtRegistration: 500,
    };
    repositoryMock.findById.mockResolvedValue(tournament);
    accessMock.isManager.mockResolvedValue(true);
    repositoryMock.findParticipantById.mockResolvedValue(participant);
    repositoryMock.findDivisionById.mockResolvedValue({
      matchType: 'DOUBLES',
      entryFeeOverrideEnabled: false,
    });
    repositoryMock.getParticipantRosters.mockResolvedValue([
      { userId: 'player-1', role: 'MAIN' },
    ]);
    repositoryMock.updateParticipantStatus.mockResolvedValue({
      ...participant,
      teamStatus: 'PENDING_PARTNER',
    });
    const broadcast = jest.fn();

    await admin.updateParticipantStatus(
      'tournament-1',
      'participant-1',
      'COMPLETE',
      'organizer-1',
      [],
      broadcast,
    );

    expect(repositoryMock.updateParticipantStatus).toHaveBeenCalledWith(
      'participant-1',
      'PENDING_PARTNER',
    );
    expect(repositoryMock.findCompletedParticipantPayment).not.toHaveBeenCalled();
    expect(repositoryMock.assignNextAvailableSeed).not.toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith('tournament-1', {
      participantId: 'participant-1',
      divisionId: 'division-1',
      action: 'APPROVED',
    });
  });

  it('does not gate non-approval doubles when processing an old approval row', async () => {
    const tournament = {
      id: 'tournament-1',
      status: 'REGISTRATION_OPEN',
      name: 'Open event',
      entryFee: 0,
      matchType: 'DOUBLES',
      tournamentConfig: { registrationMode: 'OPEN' },
    };
    const participant = {
      id: 'participant-1',
      tournamentId: 'tournament-1',
      tournamentDivisionId: 'division-1',
      teamStatus: 'PENDING_APPROVAL',
      isPaid: true,
      entryFeeAtRegistration: 0,
    };
    repositoryMock.findById.mockResolvedValue(tournament);
    accessMock.isManager.mockResolvedValue(true);
    repositoryMock.findParticipantById.mockResolvedValue(participant);
    repositoryMock.findDivisionById.mockResolvedValue({ matchType: 'DOUBLES' });
    repositoryMock.getParticipantRosters.mockResolvedValue([
      { userId: 'player-1', role: 'MAIN' },
    ]);
    repositoryMock.updateParticipantStatus.mockResolvedValue({
      ...participant,
      teamStatus: 'COMPLETE',
    });
    repositoryMock.assignNextAvailableSeed.mockResolvedValue(null);

    await admin.updateParticipantStatus(
      'tournament-1',
      'participant-1',
      'COMPLETE',
      'organizer-1',
      [],
      jest.fn(),
    );

    expect(repositoryMock.updateParticipantStatus).toHaveBeenCalledWith(
      'participant-1',
      'COMPLETE',
    );
    expect(repositoryMock.assignNextAvailableSeed).toHaveBeenCalledWith(
      'tournament-1',
      'participant-1',
    );
  });
  it('still requires payment before approving a complete doubles roster', async () => {
    const tournament = {
      id: 'tournament-1',
      status: 'REGISTRATION_OPEN',
      name: 'Regional event',
      entryFee: 500,
      matchType: 'DOUBLES',
      tournamentConfig: { registrationMode: 'APPROVAL' },
    };
    const participant = {
      id: 'participant-1',
      tournamentId: 'tournament-1',
      tournamentDivisionId: 'division-1',
      teamStatus: 'PENDING_APPROVAL',
      isPaid: false,
      entryFeeAtRegistration: 500,
    };
    repositoryMock.findById.mockResolvedValue(tournament);
    accessMock.isManager.mockResolvedValue(true);
    repositoryMock.findParticipantById.mockResolvedValue(participant);
    repositoryMock.findDivisionById.mockResolvedValue({ matchType: 'DOUBLES' });
    repositoryMock.getParticipantRosters.mockResolvedValue([
      { userId: 'player-1', role: 'MAIN' },
      { userId: 'player-2', role: 'MAIN' },
    ]);
    repositoryMock.findCompletedParticipantPayment.mockResolvedValue(null);

    await expect(
      admin.updateParticipantStatus(
        'tournament-1',
        'participant-1',
        'COMPLETE',
        'organizer-1',
        [],
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repositoryMock.updateParticipantStatus).not.toHaveBeenCalled();
  });

});
