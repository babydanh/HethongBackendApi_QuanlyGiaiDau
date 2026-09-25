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
        async (work: (transaction: typeof tx) => Promise<unknown>) =>
          work(tx),
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
