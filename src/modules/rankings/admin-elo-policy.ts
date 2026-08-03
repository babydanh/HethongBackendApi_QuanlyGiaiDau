import type {
  AdminEloOperation,
  RankingVisibilityStatus,
} from './dto/admin-elo-operation.dto';

export const ADMIN_STARTING_ELO = 1000;

export function calculateAdminElo(
  currentElo: number,
  operation: AdminEloOperation,
  requestedValue?: number,
): number {
  if (operation === 'RESET') return ADMIN_STARTING_ELO;
  if (requestedValue === undefined) throw new Error('ELO_VALUE_REQUIRED');
  const nextElo =
    operation === 'ADD'
      ? currentElo + requestedValue
      : operation === 'SUBTRACT'
        ? currentElo - requestedValue
        : requestedValue;
  if (nextElo < 0) throw new Error('ELO_CANNOT_BE_NEGATIVE');
  return nextElo;
}

export function resolveRankingVisibility(
  status: string | null,
  expiresAt: Date | null,
  now = new Date(),
): RankingVisibilityStatus {
  if (!status || (expiresAt && expiresAt.getTime() <= now.getTime()))
    return 'VISIBLE';
  if (status === 'HIDDEN' || status === 'BANNED') return status;
  return 'VISIBLE';
}
