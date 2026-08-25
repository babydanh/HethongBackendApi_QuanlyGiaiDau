import {
  calcPlatformFee,
  DEFAULT_PLATFORM_FEE_RULE,
  type PlatformFeeRule,
} from './platform-fee.helper';

describe('calcPlatformFee', () => {
  it('waives a zero-entry-fee registration by default', () => {
    expect(calcPlatformFee(0, 5)).toBe(0);
  });

  it('charges a configurable fixed fee for a positive entry fee below threshold', () => {
    expect(
      calcPlatformFee(50000, 5, {
        thresholdAmount: 100000,
        fixedAmount: 7000,
      }),
    ).toBe(7000);
  });

  it('uses the percentage at the configured threshold boundary', () => {
    expect(
      calcPlatformFee(100000, 5, {
        thresholdAmount: 100000,
        fixedAmount: 7000,
      }),
    ).toBe(5000);
  });

  it('falls back to historical defaults when a caller supplies invalid rule values', () => {
    expect(
      calcPlatformFee(99999, 5, {
        thresholdAmount: 'not-a-number',
        fixedAmount: -1,
      } as unknown as PlatformFeeRule),
    ).toBe(DEFAULT_PLATFORM_FEE_RULE.fixedAmount);
  });

  it('preserves the historical defaults when no rule is supplied', () => {
    expect(calcPlatformFee(99999, 5)).toBe(DEFAULT_PLATFORM_FEE_RULE.fixedAmount);
    expect(calcPlatformFee(100000, 5)).toBe(5000);
  });
});
