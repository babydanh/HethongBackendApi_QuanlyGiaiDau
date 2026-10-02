import * as schema from '../../database/schema';
import { PaymentsRepository } from './payments.repository';

describe('PaymentsRepository.transitionPayment', () => {
  it('locks the tournament before payment or participant updates', async () => {
    const operations: string[] = [];
    const updatedPayment = {
      id: 'payment-1',
      tournamentId: 'tournament-1',
      participantId: 'participant-1',
      status: 'COMPLETED',
      amount: '10000.00',
      platformFeeAmount: '500.00',
      purpose: 'REGISTRATION_FEE',
    };
    const select = () => {
      let table: unknown;
      const query: Record<string, unknown> = {};
      query.from = jest.fn((nextTable: unknown) => {
        table = nextTable;
        return query;
      });
      query.where = jest.fn(() => query);
      query.for = jest.fn((mode: unknown) => {
        if (table === schema.tournaments && mode === 'key share') {
          operations.push('tournament:key-share');
        }
        return query;
      });
      query.limit = jest.fn(() => query);
      query.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        const rows =
          table === schema.payments
            ? [{ tournamentId: 'tournament-1' }]
            : [{ id: 'tournament-1' }];
        operations.push(
          table === schema.payments ? 'payment:scope-read' : 'tournament:read',
        );
        return Promise.resolve(rows).then(resolve, reject);
      };
      return query;
    };

    const paymentUpdate: Record<string, jest.Mock> = {};
    paymentUpdate.set = jest.fn(() => paymentUpdate);
    paymentUpdate.where = jest.fn(() => paymentUpdate);
    paymentUpdate.returning = jest.fn(async () => {
      operations.push('payment:update');
      return [updatedPayment];
    });

    const participantUpdate: Record<string, jest.Mock> = {};
    participantUpdate.set = jest.fn(() => participantUpdate);
    participantUpdate.where = jest.fn(() => participantUpdate);
    participantUpdate.then = jest.fn((resolve) => {
      operations.push('participant:update');
      return Promise.resolve([]).then(resolve);
    });

    const tx = {
      select: jest.fn(select),
      update: jest.fn((table: unknown) =>
        table === schema.payments ? paymentUpdate : participantUpdate,
      ),
      insert: jest.fn((table: unknown) => ({
        values: jest.fn(async (values: Record<string, unknown>) => {
          if (table === schema.paymentStatusLogs) {
            operations.push('status-log:insert');
          } else if (table === schema.financialLedgerEntries) {
            operations.push(`ledger:${values.entryType}`);
          }
        }),
      })),
    };
    const db = {
      transaction: jest.fn(
        async (work: (transaction: typeof tx) => Promise<unknown>) =>
          work(tx),
      ),
    };
    const repository = new PaymentsRepository(db as never);

    await repository.transitionPayment(
      'payment-1',
      'PENDING',
      'COMPLETED',
      'provider confirmed payment',
    );

    const tournamentLockIndex = operations.indexOf('tournament:key-share');
    const paymentUpdateIndex = operations.indexOf('payment:update');
    const participantUpdateIndex = operations.indexOf('participant:update');
    expect(tournamentLockIndex).toBeGreaterThanOrEqual(0);
    expect(tournamentLockIndex).toBeLessThan(paymentUpdateIndex);
    expect(tournamentLockIndex).toBeLessThan(participantUpdateIndex);
  });
});
