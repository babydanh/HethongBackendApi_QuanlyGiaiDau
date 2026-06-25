/**
 * Consolidate platform fee calculation
 * 2-tier fee structure:
 * - entryFee >= 100k: percentage-based
 * - entryFee < 100k (including free): flat 5k
 *
 * Skill: BE Skill 5 (Payment)
 */
export function calcPlatformFee(
  entryFee: number,
  platformFeePercentage: number,
): number {
  if (entryFee >= 100000) {
    return Math.round(entryFee * (platformFeePercentage / 100));
  }
  return 5000;
}
