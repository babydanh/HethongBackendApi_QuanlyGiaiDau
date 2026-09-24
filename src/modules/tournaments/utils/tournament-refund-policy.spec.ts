import { calculateTournamentRefundQuote } from './tournament-refund-policy';

describe('calculateTournamentRefundQuote', () => {
  const registeredAt = new Date('2026-01-01T00:00:00.000Z');
  const base = {
    amount: '100000.00',
    platformFeeAmount: '5000.00',
    refundedAmount: '0.00',
    registeredAt,
  };

  it.each([
    ['one millisecond before', -1],
    ['exactly at', 0],
  ])('waives the fee %s the three-hour cutoff', (_, offset) => {
    expect(
      calculateTournamentRefundQuote({
        ...base,
        requestedAt: new Date(
          registeredAt.getTime() + 3 * 60 * 60 * 1000 + offset,
        ),
        trigger: 'WITHDRAWAL',
      }),
    ).toEqual({
      refundAmount: '100000.00',
      feeDeducted: '0.00',
      reason: 'WITHDRAWAL_WITHIN_3_HOURS',
    });
  });

  it('deducts the captured fee one millisecond after the cutoff', () => {
    expect(
      calculateTournamentRefundQuote({
        ...base,
        requestedAt: new Date(registeredAt.getTime() + 3 * 60 * 60 * 1000 + 1),
        trigger: 'WITHDRAWAL',
      }),
    ).toEqual({
      refundAmount: '95000.00',
      feeDeducted: '5000.00',
      reason: 'WITHDRAWAL_AFTER_3_HOURS',
    });
  });

  it('waives the fee for a kick regardless of elapsed time', () => {
    expect(
      calculateTournamentRefundQuote({
        ...base,
        requestedAt: new Date(
          registeredAt.getTime() + 30 * 24 * 60 * 60 * 1000,
        ),
        trigger: 'KICKED',
      }),
    ).toEqual({
      refundAmount: '100000.00',
      feeDeducted: '0.00',
      reason: 'PARTICIPANT_KICKED',
    });
  });

  it('subtracts earlier paid refunds and caps fee at remaining amount', () => {
    expect(
      calculateTournamentRefundQuote({
        ...base,
        amount: '100.00',
        platformFeeAmount: '50.00',
        refundedAmount: '60.00',
        requestedAt: new Date(registeredAt.getTime() + 3 * 60 * 60 * 1000 + 1),
        trigger: 'WITHDRAWAL',
      }),
    ).toEqual({
      refundAmount: '0.00',
      feeDeducted: '40.00',
      reason: 'WITHDRAWAL_AFTER_3_HOURS',
    });
  });

  it('returns the captured remainder when no fee was recorded', () => {
    expect(
      calculateTournamentRefundQuote({
        ...base,
        amount: '100.00',
        platformFeeAmount: null,
        refundedAmount: '10.25',
        requestedAt: new Date(registeredAt.getTime() + 3 * 60 * 60 * 1000 + 1),
        trigger: 'WITHDRAWAL',
      }),
    ).toEqual({
      refundAmount: '89.75',
      feeDeducted: '0.00',
      reason: 'WITHDRAWAL_AFTER_3_HOURS',
    });
  });

  it('rejects invalid dates and amounts instead of guessing', () => {
    expect(() =>
      calculateTournamentRefundQuote({
        ...base,
        requestedAt: new Date('invalid'),
        trigger: 'WITHDRAWAL',
      }),
    ).toThrow(RangeError);
    expect(() =>
      calculateTournamentRefundQuote({
        ...base,
        amount: 'not-money',
        requestedAt: new Date(registeredAt.getTime() + 1),
        trigger: 'WITHDRAWAL',
      }),
    ).toThrow(RangeError);
  });
});
