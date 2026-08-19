import { PaymentsService } from './payments.service';
import { PaymentPurpose } from './dto/create-payment.dto';

const makeService = (participant: Record<string, unknown>) => {
  const repository = {
    findParticipantById: jest.fn().mockResolvedValue(participant),
    findDivisionById: jest.fn().mockResolvedValue(null),
    getConfigValue: jest.fn().mockResolvedValue('0'),
    countParticipantPlayers: jest.fn().mockResolvedValue(1),
  };
  const service = new PaymentsService(
    repository as never,
    { sendNotification: jest.fn() } as never,
    { get: jest.fn().mockReturnValue(undefined) } as never,
    { reserveSlot: jest.fn(), releaseSlot: jest.fn() } as never,
  );
  return service as unknown as {
    calculatePayment: (userId: string, data: unknown, tournament: unknown) => Promise<unknown>;
  };
};

const tournament = {
  id: 'tournament-1',
  createdBy: 'organizer-1',
  name: 'Giải kiểm thử',
  entryFee: '100000',
  platformFeePercentage: '0',
  tournamentType: 'PUBLIC',
  isRanked: false,
};

const paymentData = {
  purpose: PaymentPurpose.REGISTRATION_FEE,
  participantId: 'participant-1',
  tournamentId: 'tournament-1',
};

describe('registration payment eligibility', () => {
  it('rejects PENDING_APPROVAL registrations before PayOS link creation', async () => {
    const service = makeService({
      id: 'participant-1',
      tournamentId: 'tournament-1',
      registeredBy: 'user-1',
      isPaid: false,
      teamStatus: 'PENDING_APPROVAL',
      tournamentDivisionId: null,
    });

    await expect(
      service.calculatePayment('user-1', paymentData as never, tournament as never),
    ).rejects.toThrow('phải hoàn tất đủ thành viên');
  });

  it('allows a complete unpaid registration to calculate its team fee', async () => {
    const service = makeService({
      id: 'participant-1',
      tournamentId: 'tournament-1',
      registeredBy: 'user-1',
      isPaid: false,
      teamStatus: 'COMPLETE',
      tournamentDivisionId: null,
    });

    await expect(
      service.calculatePayment('user-1', paymentData as never, tournament as never),
    ).resolves.toMatchObject({
      amount: 100000,
      participantId: 'participant-1',
    });
  });
});
