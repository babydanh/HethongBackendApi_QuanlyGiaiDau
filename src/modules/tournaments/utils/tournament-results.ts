export interface TournamentResultStandingRow {
  participantId: string;
  totalPoints: number | null;
  pointsFor: number | null;
  pointsAgainst: number | null;
  won: number | null;
}

export interface TournamentResultMemberRow {
  participantId: string;
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface PublicTournamentResultMember {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
}

/**
 * Group safe roster identities by their exact tournament participant id.
 * The result page uses this map to keep two tied teams and their members
 * separate without changing rank/shared-place calculation.
 */
export function groupTournamentResultMembers(
  rows: readonly TournamentResultMemberRow[],
): Map<string, PublicTournamentResultMember[]> {
  const membersByParticipant = new Map<string, PublicTournamentResultMember[]>();

  for (const row of rows) {
    const members = membersByParticipant.get(row.participantId) ?? [];
    members.push({
      userId: row.userId,
      fullName: row.fullName,
      avatarUrl: row.avatarUrl,
    });
    membersByParticipant.set(row.participantId, members);
  }

  return membersByParticipant;
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
