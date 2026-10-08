import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { AppDb } from '../../../database/db.types';
import type { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { TournamentsRepository } from '../tournaments.repository';
import type { TournamentPaymentRepository } from '../repositories/tournament-payment.repository';
import { RosterImportPreviewDto } from '../dto/roster-import-preview.dto';
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
    previewRosterImport: jest.fn(),
    findBracket: jest.fn(),
    hasStartedMatch: jest.fn(),
  };
  const notificationsMock = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };
  const accessMock = { isManager: jest.fn() };
  const tx = {};
  const dbMock = {
    transaction: jest.fn(
      (cb: (arg: unknown) => unknown) => Promise.resolve(cb(tx)),
    ),
  };
  const auditMock = { logUpdate: jest.fn().mockResolvedValue(undefined) };
  const paymentRepositoryMock = {
    findCompletedParticipantPaymentInTx: jest.fn(),
    createPendingRefund: jest.fn().mockResolvedValue({ id: 'refund-1' }),
    setParticipantPaidInTx: jest.fn(),
  };
  const repository = repositoryMock as unknown as TournamentsRepository;
  const access = accessMock as unknown as TournamentAccessService;
  const admin = new TournamentParticipantAdminService(
    repository,
    access,
    notificationsMock as unknown as NotificationsService,
    dbMock as unknown as AppDb,
    auditMock as unknown as AuditService,
    paymentRepositoryMock as unknown as TournamentPaymentRepository,
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
      'PENDING_APPROVAL',
    );
    expect(broadcast).toHaveBeenCalledWith('tournament-1', {
      participantId: 'participant-1',
      divisionId: null,
      action: 'APPROVED',
    });
  });
  it('approves a one-player double once when review requests race', async () => {
    const tournament = {
      id: 'tournament-1',
      status: 'REGISTRATION_OPEN',
      name: 'Regional event',
      entryFee: 500,
      matchType: 'DOUBLES',
      tournamentConfig: {
        registrationMode: 'APPROVAL',
        doublesPairingMode: 'ORGANIZER',
      },
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
    repositoryMock.updateParticipantStatus
      .mockResolvedValueOnce({
        ...participant,
        teamStatus: 'PENDING_PARTNER',
      })
      .mockResolvedValueOnce(null);
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
      'PENDING_APPROVAL',
    );
    expect(repositoryMock.findCompletedParticipantPayment).not.toHaveBeenCalled();
    expect(repositoryMock.assignNextAvailableSeed).not.toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith('tournament-1', {
      participantId: 'participant-1',
      divisionId: 'division-1',
      action: 'APPROVED',
    });
    expect(notificationsMock.sendNotification).toHaveBeenCalledTimes(1);
    expect(notificationsMock.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverId: 'player-1',
        type: 'TOURNAMENT_REGISTER_PENDING',
        title: 'Đã duyệt, đang chờ BTC ghép cặp',
        content: expect.stringContaining('Regional event'),
        redirectUrl: expect.stringContaining('divisionId=division-1'),
      }),
    );

    await expect(
      admin.updateParticipantStatus(
        'tournament-1',
        'participant-1',
        'COMPLETE',
        'organizer-1',
        [],
        broadcast,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notificationsMock.sendNotification).toHaveBeenCalledTimes(1);
  });

  it('does not send organizer queue notice for self-pairing mode', async () => {
    const tournament = {
      id: 'tournament-1',
      status: 'REGISTRATION_OPEN',
      name: 'Self-pair event',
      entryFee: 0,
      matchType: 'DOUBLES',
      tournamentConfig: {
        registrationMode: 'APPROVAL',
        doublesPairingMode: 'SELF',
      },
    };
    const participant = {
      id: 'participant-1',
      tournamentId: 'tournament-1',
      tournamentDivisionId: 'division-1',
      teamStatus: 'PENDING_APPROVAL',
      teamInviteToken: null,
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
      teamStatus: 'PENDING_PARTNER',
    });

    await admin.updateParticipantStatus(
      'tournament-1',
      'participant-1',
      'COMPLETE',
      'organizer-1',
      [],
      jest.fn(),
    );

    expect(notificationsMock.sendNotification).not.toHaveBeenCalled();
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
      'PENDING_APPROVAL',
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

  describe('setParticipantFeePaid', () => {
    const tournament = {
      id: 'tournament-1',
      status: 'REGISTRATION_OPEN',
      name: 'Regional event',
      entryFee: 500,
    };
    const baseParticipant = {
      id: 'participant-1',
      tournamentId: 'tournament-1',
      tournamentDivisionId: 'division-1',
      teamStatus: 'COMPLETE',
      isPaid: false,
      entryFeeAtRegistration: '500.00',
      registeredAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    it('rejects a caller who does not manage the tournament', async () => {
      repositoryMock.findById.mockResolvedValue(tournament);
      accessMock.isManager.mockResolvedValue(false);

      await expect(
        admin.setParticipantFeePaid(
          'tournament-1',
          'participant-1',
          true,
          'player-1',
          [],
          jest.fn(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(dbMock.transaction).not.toHaveBeenCalled();
    });

    it('rejects a participant belonging to another tournament', async () => {
      repositoryMock.findById.mockResolvedValue(tournament);
      accessMock.isManager.mockResolvedValue(true);
      repositoryMock.findParticipantById.mockResolvedValue({
        ...baseParticipant,
        tournamentId: 'tournament-2',
      });

      await expect(
        admin.setParticipantFeePaid(
          'tournament-1',
          'participant-1',
          true,
          'organizer-1',
          [],
          jest.fn(),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dbMock.transaction).not.toHaveBeenCalled();
    });

    it('is a no-op when the participant already matches the requested state', async () => {
      const broadcast = jest.fn();
      repositoryMock.findById.mockResolvedValue(tournament);
      accessMock.isManager.mockResolvedValue(true);
      repositoryMock.findParticipantById.mockResolvedValue(baseParticipant);

      await expect(
        admin.setParticipantFeePaid(
          'tournament-1',
          'participant-1',
          false,
          'organizer-1',
          [],
          broadcast,
        ),
      ).resolves.toEqual({
        participant: baseParticipant,
        refundRequested: false,
        refundPaymentId: null,
      });
      expect(dbMock.transaction).not.toHaveBeenCalled();
      expect(auditMock.logUpdate).not.toHaveBeenCalled();
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('marks the fee paid without creating any payment row', async () => {
      const broadcast = jest.fn();
      const updated = { ...baseParticipant, isPaid: true };
      repositoryMock.findById.mockResolvedValue(tournament);
      accessMock.isManager.mockResolvedValue(true);
      repositoryMock.findParticipantById.mockResolvedValue(baseParticipant);
      paymentRepositoryMock.setParticipantPaidInTx.mockResolvedValue(updated);

      const result = await admin.setParticipantFeePaid(
        'tournament-1',
        'participant-1',
        true,
        'organizer-1',
        [],
        broadcast,
      );

      expect(result).toEqual({
        participant: updated,
        refundRequested: false,
        refundPaymentId: null,
      });
      expect(paymentRepositoryMock.createPendingRefund).not.toHaveBeenCalled();
      expect(paymentRepositoryMock.setParticipantPaidInTx).toHaveBeenCalledWith(
        tx,
        'participant-1',
        true,
      );
      expect(auditMock.logUpdate).toHaveBeenCalledWith(
        tx,
        'organizer-1',
        'tournament_participants',
        'participant-1',
        baseParticipant,
        updated,
      );
      expect(broadcast).toHaveBeenCalledWith('tournament-1', {
        participantId: 'participant-1',
        divisionId: 'division-1',
        action: 'FEE_PAYMENT_UPDATED',
      });
    });

    it('requests a refund through the policy quote when unmarking a captured fee', async () => {
      const updated = { ...baseParticipant, isPaid: true };
      repositoryMock.findById.mockResolvedValue(tournament);
      accessMock.isManager.mockResolvedValue(true);
      repositoryMock.findParticipantById.mockResolvedValue(updated);
      paymentRepositoryMock.findCompletedParticipantPaymentInTx.mockResolvedValue({
        id: 'payment-1',
        amount: '500.00',
        platformFeeAmount: '15.00',
        refundedAmount: '0.00',
        refundStatus: null,
        refundableAmount: '500.00',
      });
      paymentRepositoryMock.setParticipantPaidInTx.mockResolvedValue({
        ...baseParticipant,
      });

      const result = await admin.setParticipantFeePaid(
        'tournament-1',
        'participant-1',
        false,
        'organizer-1',
        [],
        jest.fn(),
      );

      expect(result.refundRequested).toBe(true);
      expect(result.refundPaymentId).toBe('payment-1');
      expect(paymentRepositoryMock.createPendingRefund).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          paymentId: 'payment-1',
          amount: '500.00',
          reason: 'ORGANIZER_UNMARKED_FEE_PAID',
          requestedBy: 'organizer-1',
        }),
      );
      expect(paymentRepositoryMock.setParticipantPaidInTx).toHaveBeenCalledWith(
        tx,
        'participant-1',
        false,
      );
    });

    it('skips the refund when the fee was only ever marked manually', async () => {
      repositoryMock.findById.mockResolvedValue(tournament);
      accessMock.isManager.mockResolvedValue(true);
      repositoryMock.findParticipantById.mockResolvedValue({
        ...baseParticipant,
        isPaid: true,
      });
      paymentRepositoryMock.findCompletedParticipantPaymentInTx.mockResolvedValue(
        null,
      );
      paymentRepositoryMock.setParticipantPaidInTx.mockResolvedValue(
        baseParticipant,
      );

      const result = await admin.setParticipantFeePaid(
        'tournament-1',
        'participant-1',
        false,
        'organizer-1',
        [],
        jest.fn(),
      );

      expect(result).toEqual({
        participant: baseParticipant,
        refundRequested: false,
        refundPaymentId: null,
      });
      expect(paymentRepositoryMock.createPendingRefund).not.toHaveBeenCalled();
      expect(paymentRepositoryMock.setParticipantPaidInTx).toHaveBeenCalledWith(
        tx,
        'participant-1',
        false,
      );
    });

    it('clears the mark without raising a second refund when one is already pending', async () => {
      // Tick -> untick -> tick -> untick. The second untick must not hit the
      // compare-and-set inside createPendingRefund, which would throw, roll the
      // whole transaction back and leave the checkbox stuck on.
      const cleared = { ...baseParticipant, isPaid: false };
      repositoryMock.findById.mockResolvedValue(tournament);
      accessMock.isManager.mockResolvedValue(true);
      repositoryMock.findParticipantById.mockResolvedValue({
        ...baseParticipant,
        isPaid: true,
      });
      paymentRepositoryMock.findCompletedParticipantPaymentInTx.mockResolvedValue({
        id: 'payment-1',
        amount: '500.00',
        platformFeeAmount: '15.00',
        refundedAmount: '0.00',
        refundStatus: 'PENDING_REFUND',
        refundableAmount: '500.00',
      });
      paymentRepositoryMock.setParticipantPaidInTx.mockResolvedValue(cleared);

      const result = await admin.setParticipantFeePaid(
        'tournament-1',
        'participant-1',
        false,
        'organizer-1',
        [],
        jest.fn(),
      );

      expect(result).toEqual({
        participant: cleared,
        refundRequested: false,
        refundPaymentId: null,
      });
      expect(paymentRepositoryMock.createPendingRefund).not.toHaveBeenCalled();
      expect(paymentRepositoryMock.setParticipantPaidInTx).toHaveBeenCalledWith(
        tx,
        'participant-1',
        false,
      );
    });

    it('refuses to mark a fee paid once registration has closed', async () => {
      repositoryMock.findById.mockResolvedValue({
        ...tournament,
        status: 'COMPLETED',
      });
      accessMock.isManager.mockResolvedValue(true);
      repositoryMock.findParticipantById.mockResolvedValue(baseParticipant);

      await expect(
        admin.setParticipantFeePaid(
          'tournament-1',
          'participant-1',
          true,
          'organizer-1',
          [],
          jest.fn(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dbMock.transaction).not.toHaveBeenCalled();
      expect(paymentRepositoryMock.setParticipantPaidInTx).not.toHaveBeenCalled();
    });

    it('still allows unmarking after the event, because refunds happen late', async () => {
      const cleared = { ...baseParticipant, isPaid: false };
      repositoryMock.findById.mockResolvedValue({
        ...tournament,
        status: 'COMPLETED',
      });
      accessMock.isManager.mockResolvedValue(true);
      repositoryMock.findParticipantById.mockResolvedValue({
        ...baseParticipant,
        isPaid: true,
      });
      paymentRepositoryMock.findCompletedParticipantPaymentInTx.mockResolvedValue(
        null,
      );
      paymentRepositoryMock.setParticipantPaidInTx.mockResolvedValue(cleared);

      await expect(
        admin.setParticipantFeePaid(
          'tournament-1',
          'participant-1',
          false,
          'organizer-1',
          [],
          jest.fn(),
        ),
      ).resolves.toEqual({
        participant: cleared,
        refundRequested: false,
        refundPaymentId: null,
      });
    });
  });

  describe('previewRosterImport eligibility', () => {
    const closedTournament = {
      id: 'tournament-1',
      status: 'REGISTRATION_CLOSED',
      isRegistrationLocked: true,
    };
    const previewDto = Object.assign(new RosterImportPreviewDto(), {
      participants: [{ teamName: 'VĐV 1', player1Name: 'VĐV 1' }],
    } as never);
    const previewResult = {
      divisionMatched: false,
      rows: [],
      requestedTeamSlots: 0,
      capacityRemaining: null,
    };

    beforeEach(() => {
      repositoryMock.findById.mockResolvedValue(closedTournament);
      accessMock.isManager.mockResolvedValue(true);
      repositoryMock.hasStartedMatch.mockResolvedValue(false);
      repositoryMock.findBracket.mockResolvedValue({ stages: [] });
      repositoryMock.previewRosterImport.mockResolvedValue(previewResult);
    });

    it('previews while registration is closed and the bracket does not exist yet', async () => {
      await expect(
        admin.previewRosterImport('tournament-1', 'organizer-1', [], previewDto),
      ).resolves.toEqual(previewResult);

      expect(repositoryMock.previewRosterImport).toHaveBeenCalledWith(
        'tournament-1',
        previewDto,
      );
    });

    it('rejects the preview once a bracket stage exists', async () => {
      repositoryMock.findBracket.mockResolvedValue({
        stages: [{ id: 'stage-1' }],
      });

      await expect(
        admin.previewRosterImport('tournament-1', 'organizer-1', [], previewDto),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repositoryMock.previewRosterImport).not.toHaveBeenCalled();
    });

    it('rejects the preview once a match has started', async () => {
      repositoryMock.hasStartedMatch.mockResolvedValue(true);

      await expect(
        admin.previewRosterImport('tournament-1', 'organizer-1', [], previewDto),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repositoryMock.previewRosterImport).not.toHaveBeenCalled();
    });

    it('rejects the preview for a completed tournament even without a bracket', async () => {
      repositoryMock.findById.mockResolvedValue({
        ...closedTournament,
        status: 'COMPLETED',
      });

      await expect(
        admin.previewRosterImport('tournament-1', 'organizer-1', [], previewDto),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(repositoryMock.previewRosterImport).not.toHaveBeenCalled();
    });

    it('keeps the manager authorization gate for the preview', async () => {
      accessMock.isManager.mockResolvedValue(false);

      await expect(
        admin.previewRosterImport('tournament-1', 'organizer-1', [], previewDto),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repositoryMock.previewRosterImport).not.toHaveBeenCalled();
    });
  });

});
