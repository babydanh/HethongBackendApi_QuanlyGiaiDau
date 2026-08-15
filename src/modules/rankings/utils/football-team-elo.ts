export interface FootballTeamEloCalculation {
  expected1: number;
  expected2: number;
  delta1: number;
  delta2: number;
}

/**
 * Pure football-team ELO calculation. Keeping this separate from the
 * repository transaction makes the rating rule deterministic and testable.
 */
export function calculateFootballTeamElo(
  elo1: number,
  elo2: number,
  score1: 0 | 0.5 | 1,
  kFactor = 32,
): FootballTeamEloCalculation {
  if (!Number.isFinite(elo1) || !Number.isFinite(elo2)) {
    throw new Error('Football team ELO must be finite.');
  }
  if (!Number.isFinite(kFactor) || kFactor <= 0) {
    throw new Error('Football team ELO K-factor must be positive.');
  }

  const expected1 = 1 / (1 + 10 ** ((elo2 - elo1) / 400));
  const expected2 = 1 - expected1;
  return {
    expected1,
    expected2,
    delta1: Math.round(kFactor * (score1 - expected1)),
    delta2: Math.round(kFactor * (1 - score1 - expected2)),
  };
}
