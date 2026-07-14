export type BracketParticipantSlot = 'participant1Id' | 'participant2Id';

export const MIN_DOUBLE_ELIMINATION_PARTICIPANTS = 4;
export const MAX_DOUBLE_ELIMINATION_PARTICIPANTS = 64;

export interface DoubleEliminationShape {
  bracketSize: number;
  winnersRounds: number;
  losersRounds: number;
  winnersMatchCounts: number[];
  losersMatchCounts: number[];
}

interface WinnerTargetSlotInput {
  sourceBranch: string;
  sourceRoundNumber: number;
  sourceMatchOrder: number;
  targetBranch: string;
}

interface LoserTargetSlotInput {
  sourceRoundNumber: number;
  sourceMatchOrder: number;
}

export function getDoubleEliminationShape(
  participantCount: number,
): DoubleEliminationShape {
  if (
    !Number.isInteger(participantCount) ||
    participantCount < MIN_DOUBLE_ELIMINATION_PARTICIPANTS ||
    participantCount > MAX_DOUBLE_ELIMINATION_PARTICIPANTS
  ) {
    throw new RangeError(
      `Double elimination requires ${MIN_DOUBLE_ELIMINATION_PARTICIPANTS}-${MAX_DOUBLE_ELIMINATION_PARTICIPANTS} participants`,
    );
  }

  const bracketSize = Math.pow(2, Math.ceil(Math.log2(participantCount)));
  const winnersRounds = Math.log2(bracketSize);
  const losersRounds = 2 * winnersRounds - 2;
  const winnersMatchCounts = Array.from(
    { length: winnersRounds },
    (_, index) => bracketSize / Math.pow(2, index + 1),
  );
  const losersMatchCounts = Array.from(
    { length: losersRounds },
    (_, index) => bracketSize / Math.pow(2, Math.floor(index / 2) + 2),
  );

  return {
    bracketSize,
    winnersRounds,
    losersRounds,
    winnersMatchCounts,
    losersMatchCounts,
  };
}

export function resolveWinnerTargetSlot({
  sourceBranch,
  sourceRoundNumber,
  sourceMatchOrder,
  targetBranch,
}: WinnerTargetSlotInput): BracketParticipantSlot {
  if (targetBranch === 'GRAND_FINALS') {
    return sourceBranch === 'MAIN' ? 'participant1Id' : 'participant2Id';
  }

  // Odd losers rounds feed a same-sized round. Their winner occupies slot 1;
  // the new loser dropping from the winners bracket occupies slot 2.
  if (sourceBranch === 'LOSERS' && sourceRoundNumber % 2 !== 0) {
    return 'participant1Id';
  }

  return sourceMatchOrder % 2 !== 0
    ? 'participant1Id'
    : 'participant2Id';
}

export function resolveLoserTargetSlot({
  sourceRoundNumber,
  sourceMatchOrder,
}: LoserTargetSlotInput): BracketParticipantSlot {
  if (sourceRoundNumber === 1) {
    return sourceMatchOrder % 2 !== 0
      ? 'participant1Id'
      : 'participant2Id';
  }

  return 'participant2Id';
}

export function resolveWinnersLoserTargetIndex(
  sourceRoundNumber: number,
  sourceMatchIndex: number,
  sourceRoundMatchCount: number,
): number {
  if (sourceRoundNumber === 1) {
    return Math.floor(sourceMatchIndex / 2);
  }

  // Cross adjacent sections to avoid an immediate rematch with an opponent
  // from the same winners-bracket section.
  return sourceRoundMatchCount > 1 ? sourceMatchIndex ^ 1 : 0;
}
