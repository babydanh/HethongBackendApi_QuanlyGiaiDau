export interface RegistrationPaymentRosterContext {
  teamStatus: string | null | undefined;
  matchType: string | null | undefined;
  isFootball: boolean;
  rosterCount: number;
  mainRosterCount?: number;
  requiredFootballMainRosterCount?: number;
}

export interface RegistrationPaidStateContext {
  persistedIsPaid: boolean | null | undefined;
  feeSnapshot: number | string | null | undefined;
  hasCompletedPayment: boolean;
  isLiteRegistration: boolean;
}

/** Resolve payment state without trusting a legacy Lite pairing flag. */
export function isRegistrationFeePaid({
  persistedIsPaid,
  feeSnapshot,
  hasCompletedPayment,
  isLiteRegistration,
}: RegistrationPaidStateContext): boolean {
  const feeAmount = Number(feeSnapshot);
  if (Number.isFinite(feeAmount) && feeAmount <= 0) return true;
  if (hasCompletedPayment) return true;
  if (isLiteRegistration) return false;
  return persistedIsPaid === true;
}

export function isLiteRegistrationTournament(config: unknown): boolean {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return false;
  }
  const values = config as Record<string, unknown>;
  return values.isLite === true || values.mode === 'LITE';
}

/**
 * A registration can pay when its roster is complete. APPROVAL mode keeps the
 * participant in PENDING_APPROVAL until the organizer approves it, so that
 * status is also payable when the roster itself is complete. Incomplete
 * doubles/football registrations remain blocked.
 */
export function isRegistrationRosterCompleteForPayment({
  teamStatus,
  matchType,
  isFootball,
  rosterCount,
  mainRosterCount = rosterCount,
  requiredFootballMainRosterCount = 1,
}: RegistrationPaymentRosterContext): boolean {
  if (teamStatus === 'COMPLETE') return true;
  if (teamStatus !== 'PENDING_APPROVAL') return false;

  if (isFootball) {
    return mainRosterCount >= Math.max(1, requiredFootballMainRosterCount);
  }

  const requiresTwoPlayers =
    matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
  return rosterCount >= (requiresTwoPlayers ? 2 : 1);
}
