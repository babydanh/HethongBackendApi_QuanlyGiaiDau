import { ForbiddenException } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { CreateLiteTournamentDto } from './dto/create-lite-tournament.dto';

describe('TournamentsService.createLite fee policy', () => {
  it('does not persist a Lite tournament when public fees are disabled', async () => {
    const forbidden = new ForbiddenException('Entry fees are disabled');
    const createLite = jest.fn().mockResolvedValue({ id: 'must-not-be-created' });
    const service = Object.assign(Object.create(TournamentsService.prototype), {
      tournamentFeePolicyService: {
        assertEntryFeeAllowed: jest.fn().mockRejectedValue(forbidden),
      },
      tournamentLiteService: { createLite },
    }) as TournamentsService;

    await expect(
      service.createLite('organizer-id', { entryFee: 100 } as CreateLiteTournamentDto),
    ).rejects.toBe(forbidden);
    expect(createLite).not.toHaveBeenCalled();
  });
});
