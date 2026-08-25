/**
 * Canonical platform-fee policy used by payment and settlement calculations.
 * Admin configuration is snapshotted onto each tournament at creation time.
 */
export interface PlatformFeeRule {
  thresholdAmount: number;
  fixedAmount: number;
}

export const DEFAULT_PLATFORM_FEE_RULE: PlatformFeeRule = {
  thresholdAmount: 100000,
  fixedAmount: 5000,
};

/**
 * Calculate the platform fee for one registered player.
 *
 * - percentage is zero: no platform fee
 * - free registration: no platform fee
 * - entry fee at/above threshold: percentage-based
 * - positive entry fee below threshold: fixed fee
 */
export function calcPlatformFee(
  entryFee: number,
  platformFeePercentage: number,
  rule: PlatformFeeRule = DEFAULT_PLATFORM_FEE_RULE,
): number {
  if (platformFeePercentage <= 0 || entryFee === 0) {
    return 0;
  }
  const thresholdAmount =
    Number.isSafeInteger(rule.thresholdAmount) && rule.thresholdAmount >= 0
      ? rule.thresholdAmount
      : DEFAULT_PLATFORM_FEE_RULE.thresholdAmount;
  const fixedAmount =
    Number.isSafeInteger(rule.fixedAmount) && rule.fixedAmount >= 0
      ? rule.fixedAmount
      : DEFAULT_PLATFORM_FEE_RULE.fixedAmount;
  if (entryFee >= thresholdAmount) {
    return Math.round(entryFee * (platformFeePercentage / 100));
  }
  return fixedAmount;
}
