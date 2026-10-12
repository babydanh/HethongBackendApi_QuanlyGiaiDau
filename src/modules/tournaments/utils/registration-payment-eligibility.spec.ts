import { isRegistrationFeePaid } from './registration-payment-eligibility';

describe('isRegistrationFeePaid', () => {
  const unpaid = {
    persistedIsPaid: false,
    feeSnapshot: 50000,
    hasCompletedPayment: false,
    isLiteRegistration: false,
    organizerWaivedFee: false,
  };

  it('treats a waived fee as paid in a Lite tournament', () => {
    expect(
      isRegistrationFeePaid({
        ...unpaid,
        isLiteRegistration: true,
        organizerWaivedFee: true,
      }),
    ).toBe(true);
  });

  it('treats a waived fee as paid in a non-Lite tournament', () => {
    expect(
      isRegistrationFeePaid({ ...unpaid, organizerWaivedFee: true }),
    ).toBe(true);
  });

  it('keeps a Lite registration unpaid when the fee is not waived', () => {
    expect(
      isRegistrationFeePaid({
        ...unpaid,
        isLiteRegistration: true,
        persistedIsPaid: true,
      }),
    ).toBe(false);
  });

  it('follows the persisted flag for a non-Lite registration without a waiver', () => {
    expect(isRegistrationFeePaid(unpaid)).toBe(false);
    expect(isRegistrationFeePaid({ ...unpaid, persistedIsPaid: true })).toBe(
      true,
    );
  });
});
