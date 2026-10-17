import { ForbiddenException } from '@nestjs/common';
import { TournamentAccessService } from '../tournaments/services/tournament-access.service';
import { PaymentPurpose } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

const clubTournament = {
  id: 'tournament-1',
  createdBy: 'organizer-1',
  communityId: 'club-1',
  status: 'COMPLETED',
};

function makeService(membership: { status: string; role: string } | null) {
  const paymentsRepository = {
    findTournamentById: jest.fn().mockResolvedValue(clubTournament),
    createPayoutRequest: jest.fn().mockResolvedValue({ id: 'payout-1' }),
  };
  const tournamentsRepository = {
    findCommunityMember: jest.fn().mockResolvedValue(membership),
  };
  const service = new PaymentsService(
    paymentsRepository as never,
    { sendNotification: jest.fn() } as never,
    { get: jest.fn().mockReturnValue(undefined) } as never,
    new TournamentAccessService(tournamentsRepository as never),
  );
  return { service, paymentsRepository };
}

describe('PaymentsService creator membership (giải CLB)', () => {
  it('denies requestPayout to the club tournament creator who has left the club', async () => {
    const { service, paymentsRepository } = makeService(null);

    await expect(
      service.requestPayout('organizer-1', {
        tournamentId: 'tournament-1',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(paymentsRepository.createPayoutRequest).not.toHaveBeenCalled();
  });

  it('allows requestPayout to the club tournament creator who is still an active member', async () => {
    const { service, paymentsRepository } = makeService({
      status: 'JOINED',
      role: 'MEMBER',
    });

    await expect(
      service.requestPayout('organizer-1', {
        tournamentId: 'tournament-1',
      } as never),
    ).resolves.toEqual({ id: 'payout-1' });
    expect(paymentsRepository.createPayoutRequest).toHaveBeenCalledWith(
      'organizer-1',
      { tournamentId: 'tournament-1' },
    );
  });

  it('denies the tournament publish fee to the club tournament creator who has left the club', async () => {
    const { service } = makeService(null);
    const payer = service as unknown as {
      calculatePayment: (
        userId: string,
        data: unknown,
        tournament: unknown,
      ) => Promise<unknown>;
    };

    await expect(
      payer.calculatePayment(
        'organizer-1',
        { purpose: PaymentPurpose.TOURNAMENT_PUBLISH_FEE },
        clubTournament,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
