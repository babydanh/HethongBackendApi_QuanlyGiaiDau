export type TournamentRefundReason =
  | 'WITHDRAWAL_WITHIN_3_HOURS'
  | 'WITHDRAWAL_AFTER_3_HOURS'
  | 'PARTICIPANT_KICKED';

export interface TournamentRefundQuoteInput {
  amount: string | number;
  platformFeeAmount: string | number | null | undefined;
  refundedAmount: string | number | null | undefined;
  registeredAt: Date;
  requestedAt: Date;
  trigger: 'WITHDRAWAL' | 'KICKED';
}

export interface TournamentRefundQuote {
  refundAmount: string;
  feeDeducted: string;
  reason: TournamentRefundReason;
}

const REFUND_WINDOW_MS = 3 * 60 * 60 * 1000;

function toMinorUnits(value: string | number | null | undefined): bigint {
  if (value == null) return 0n;

  const match = String(value).trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new RangeError('Invalid non-negative payment amount');

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0'));
  return whole * 100n + fraction;
}

function toAmount(minorUnits: bigint): string {
  const whole = minorUnits / 100n;
  const fraction = (minorUnits % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

export function calculateTournamentRefundQuote(
  input: TournamentRefundQuoteInput,
): TournamentRefundQuote {
  const registeredAt = input.registeredAt.getTime();
  const requestedAt = input.requestedAt.getTime();
  if (
    !Number.isFinite(registeredAt) ||
    !Number.isFinite(requestedAt) ||
    requestedAt < registeredAt
  ) {
    throw new RangeError('Invalid refund policy timestamps');
  }

  const captured = toMinorUnits(input.amount);
  const alreadyRefunded = toMinorUnits(input.refundedAmount);
  const capturedFee = toMinorUnits(input.platformFeeAmount);
  if (alreadyRefunded > captured || capturedFee > captured) {
    throw new RangeError('Refund exceeds captured amount');
  }

  const remaining = captured - alreadyRefunded;
  const withinWindow = requestedAt - registeredAt <= REFUND_WINDOW_MS;
  const waiveFee = input.trigger === 'KICKED' || withinWindow;
  const feeDeducted = waiveFee
    ? 0n
    : capturedFee < remaining
      ? capturedFee
      : remaining;

  return {
    refundAmount: toAmount(remaining - feeDeducted),
    feeDeducted: toAmount(feeDeducted),
    reason:
      input.trigger === 'KICKED'
        ? 'PARTICIPANT_KICKED'
        : withinWindow
          ? 'WITHDRAWAL_WITHIN_3_HOURS'
          : 'WITHDRAWAL_AFTER_3_HOURS',
  };
}
