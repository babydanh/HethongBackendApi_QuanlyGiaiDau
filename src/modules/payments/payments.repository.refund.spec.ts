import { ConflictException } from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';

function selectQuery(rows: unknown[]) {
  const query: Record<string, jest.Mock> = {};
  query.from = jest.fn(() => query);
  query.where = jest.fn(() => query);
  query.orderBy = jest.fn(() => query);
  query.limit = jest.fn().mockResolvedValue(rows);
  return query;
}

function settlementTransaction(reason: string) {
  const payment = {
    id: 'payment-1',
    amount: '500.00',
    platformFeeAmount: '15.00',
    tournamentId: 'tournament-1',
    status: 'COMPLETED',
    refundStatus: 'PENDING_REFUND',
  };
  const requestedRefund = {
    id: 'refund-1',
    paymentId: payment.id,
    status: 'REQUESTED',
    amount: reason === 'WITHDRAWAL_AFTER_3_HOURS' ? '485.00' : '500.00',
    reason,
  };
  const selectResults = [[payment], [requestedRefund]];
  let selectIndex = 0;
  const updateResults = [[payment], [requestedRefund]];
  let updateIndex = 0;
  const createdEntries: Record<string, unknown>[] = [];
  const tx = {
    select: jest.fn(() => selectQuery(selectResults[selectIndex++])),
    update: jest.fn(() => {
      const query: Record<string, jest.Mock> = {};
      query.set = jest.fn(() => query);
      query.where = jest.fn(() => query);
      query.returning = jest
        .fn()
        .mockResolvedValue(updateResults[updateIndex++]);
      return query;
    }),
    insert: jest.fn(() => ({
      values: jest.fn((entry: Record<string, unknown>) => {
        createdEntries.push(entry);
        return Promise.resolve();
      }),
    })),
  };
  const db = {
    transaction: jest.fn(
      async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
    ),
  };
  return { db, createdEntries };
}

describe('PaymentsRepository.confirmLegacyRefund', () => {
  it('rejects a pending legacy refund without a stored request amount', async () => {
    const payment = {
      id: 'payment-1',
      amount: '100000.00',
      platformFeeAmount: '5000.00',
      tournamentId: 'tournament-1',
      status: 'COMPLETED',
      refundStatus: 'PENDING_REFUND',
    };
    const selectResults = [[payment], []];
    let selectIndex = 0;
    const tx = {
      select: jest.fn(() => selectQuery(selectResults[selectIndex++])),
      update: jest.fn(),
      insert: jest.fn(),
    };
    const db = {
      transaction: jest.fn(
        async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
      ),
    };
    const repository = new PaymentsRepository(db as never);

    await expect(
      repository.confirmLegacyRefund('payment-1', 'admin-1', 'proof-url'),
    ).rejects.toThrow(ConflictException);
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

describe.each(['ORGANIZER_UNMARKED_FEE_PAID', 'TOURNAMENT_CANCELLED'])(
  'PaymentsRepository.confirmLegacyRefund reason %s',
  (reason) => {
    it('records the platform fee reversal for a full refund', async () => {
      const { db, createdEntries } = settlementTransaction(reason);
      const repository = new PaymentsRepository(db as never);

      await repository.confirmLegacyRefund('payment-1', 'admin-1', 'proof-url');

      const feeReversals = createdEntries.filter(
        (entry) => entry.entryType === 'PLATFORM_FEE_REVERSED',
      );
      expect(feeReversals).toEqual([
        expect.objectContaining({
          entryType: 'PLATFORM_FEE_REVERSED',
          direction: 'CREDIT',
          amount: '15.00',
          idempotencyKey: 'refund:refund-1:platform-fee-reversed',
        }),
      ]);
    });
  },
);

it('does not reverse the platform fee when the refund amount already deducts it', async () => {
  const { db, createdEntries } = settlementTransaction(
    'WITHDRAWAL_AFTER_3_HOURS',
  );
  const repository = new PaymentsRepository(db as never);

  await repository.confirmLegacyRefund('payment-1', 'admin-1', 'proof-url');

  expect(
    createdEntries.some((entry) => entry.entryType === 'PLATFORM_FEE_REVERSED'),
  ).toBe(false);
});
