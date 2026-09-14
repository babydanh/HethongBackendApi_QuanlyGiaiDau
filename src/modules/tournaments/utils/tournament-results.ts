export interface TournamentResultStandingRow {
  participantId: string;
  totalPoints: number | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  won: number | null;
}

function numericValue(value: number | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Pick one deterministic, tournament-wide Top 4 from grouped standings.
 * Group standings are already ordered inside each group, but concatenating
 * the groups would incorrectly restart ranks at 1 for every group.
 */
export function selectTopTournamentStandings<
  T extends TournamentResultStandingRow,
>(rows: readonly T[], limit = 4): T[] {
  const seenParticipantIds = new Set<string>();

  return [...rows]
    .sort((a, b) => {
      const pointsDifference =
        numericValue(b.totalPoints) - numericValue(a.totalPoints);
      if (pointsDifference !== 0) return pointsDifference;

      const scoreDifference =
        numericValue(b.pointsFor) -
        numericValue(b.pointsAgainst) -
        (numericValue(a.pointsFor) - numericValue(a.pointsAgainst));
      if (scoreDifference !== 0) return scoreDifference;

      const pointsForDifference =
        numericValue(b.pointsFor) - numericValue(a.pointsFor);
      if (pointsForDifference !== 0) return pointsForDifference;

      const winsDifference = numericValue(b.won) - numericValue(a.won);
      if (winsDifference !== 0) return winsDifference;

      return a.participantId.localeCompare(b.participantId);
    })
    .filter((row) => {
      if (!row.participantId || seenParticipantIds.has(row.participantId)) {
        return false;
      }
      seenParticipantIds.add(row.participantId);
      return true;
    })
    .slice(0, limit);
}
