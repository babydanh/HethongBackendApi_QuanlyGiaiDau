export type FootballTeamEloOutcomeLabel =
  | 'WIN'
  | 'LOSS'
  | 'DRAW'
  | 'FORFEIT'
  | 'NO_SHOW';

export interface FootballTeamEloOutcome {
  score1: 0 | 0.5 | 1;
  score2: 0 | 0.5 | 1;
  outcome1: FootballTeamEloOutcomeLabel;
  outcome2: FootballTeamEloOutcomeLabel;
}

const specialActions = new Set([
  'WALKOVER',
  'NO_SHOW',
  'DISQUALIFICATION',
]);

/**
 * Resolves the result used by team ELO without touching persistence. A
 * shootout winner is already represented by match.winnerId; only the
 * special-result label changes the audit outcome.
 */
export function resolveFootballTeamEloOutcome(input: {
  winnerId: string | null | undefined;
  participant1Id: string;
  participant2Id: string;
  specialAction?: string | null;
}): FootballTeamEloOutcome {
  const { winnerId, participant1Id, participant2Id, specialAction } = input;
  if (
    winnerId &&
    winnerId !== participant1Id &&
    winnerId !== participant2Id
  ) {
    throw new Error('Football ELO winner must be one of the match participants.');
  }

  const score1 = winnerId
    ? winnerId === participant1Id
      ? 1
      : 0
    : 0.5;
  const score2 = (1 - score1) as 0 | 0.5 | 1;
  const isSpecial = specialAction ? specialActions.has(specialAction) : false;
  const outcome1: FootballTeamEloOutcomeLabel = isSpecial
    ? score1 === 1
      ? 'FORFEIT'
      : 'NO_SHOW'
    : score1 === 1
      ? 'WIN'
      : score1 === 0.5
        ? 'DRAW'
        : 'LOSS';
  const outcome2: FootballTeamEloOutcomeLabel = isSpecial
    ? score2 === 1
      ? 'FORFEIT'
      : 'NO_SHOW'
    : score2 === 1
      ? 'WIN'
      : score2 === 0.5
        ? 'DRAW'
        : 'LOSS';

  return { score1, score2, outcome1, outcome2 };
}
