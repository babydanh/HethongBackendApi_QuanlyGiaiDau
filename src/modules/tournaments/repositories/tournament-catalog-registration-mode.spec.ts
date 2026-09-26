import { BadRequestException } from '@nestjs/common';
import type { AppDb } from '../../../database/db.types';
import type { AuditService } from '../../audit/audit.service';
import type { SeriesService } from '../../series/series.service';
import type { TournamentPaymentRepository } from './tournament-payment.repository';
import { TournamentCatalogRepository } from './tournament-catalog.repository';
import type { UpdateTournamentDto } from '../dto/update-tournament.dto';

describe('TournamentCatalogRepository registration-mode transaction guard', () => {
  it('serializes mode changes with registration and rejects active participants', async () => {
    const events: string[] = [];
    const existing = {
      id: 'tournament-1',
      tournamentConfig: { registrationMode: 'OPEN' },
      entryFee: '0.00',
      status: 'REGISTRATION_OPEN',
      isRegistrationLocked: false,
    };
    const lockQuery = (() => {
      const query = {
        from: jest.fn(),
        where: jest.fn(),
        for: jest.fn(),
        limit: jest.fn().mockResolvedValue([existing]),
      };
      query.from.mockReturnValue(query);
      query.where.mockReturnValue(query);
      query.for.mockImplementation(() => {
        events.push('tournament-row-lock');
        return query;
      });
      return query;
    })();
    const countQuery = {
      from: jest.fn(),
      where: jest.fn(),
    };
    countQuery.from.mockReturnValue(countQuery);
    countQuery.where.mockImplementation(async () => {
      events.push('active-participant-count');
      return [{ count: 1 }];
    });
    const transaction = {
      select: jest
        .fn()
        .mockReturnValueOnce(lockQuery)
        .mockReturnValueOnce(countQuery),
    };
    // The repository test supplies only the transaction operations reached before rejection.
    const db = {
      transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(transaction),
    } as unknown as AppDb;
    const paymentRepository = {
      assertEntryFeeChangeAllowed: jest.fn(),
    } as unknown as TournamentPaymentRepository;
    const repository = new TournamentCatalogRepository(
      db,
      null as unknown as AuditService,
      null as unknown as SeriesService,
      paymentRepository,
    );
    const update = {
      tournamentConfig: { registrationMode: 'APPROVAL' },
    } satisfies UpdateTournamentDto;

    await expect(
      repository.update('tournament-1', 'organizer-1', update),
    ).rejects.toThrow(BadRequestException);

    expect(events).toEqual([
      'tournament-row-lock',
      'active-participant-count',
    ]);
    expect(paymentRepository.assertEntryFeeChangeAllowed).not.toHaveBeenCalled();
  });
});
