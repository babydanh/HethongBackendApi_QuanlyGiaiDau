export interface FootballStandingRow {
  participantId: string;
  groupId: string;
  totalPoints: number;
  pointsFor: number;
  pointsAgainst: number;
  won: number;
}

export interface FootballStandingMatch {
  groupId: string | null;
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  scoreDetails: unknown;
}

/**
 * Stable football table ordering shared by the read endpoint and bracket
 * advancement.  The database aggregate stores the inexpensive totals; H2H
 * and fair-play are derived from completed immutable match snapshots here.
 */
export function sortFootballStandings<T extends FootballStandingRow>(
  rows: T[],
  matches: FootballStandingMatch[],
): T[] {
  const participantIds = new Set(rows.map((row) => row.participantId));
  const headToHead = new Map<string, number>(rows.map((row) => [row.participantId, 0]));
  const fairPlay = new Map<string, number>(rows.map((row) => [row.participantId, 0]));
  const groupId = rows[0]?.groupId;

  for (const match of matches) {
    if (match.groupId !== groupId || !match.participant1Id || !match.participant2Id ||
        !participantIds.has(match.participant1Id) || !participantIds.has(match.participant2Id)) continue;

    if (match.winnerId === match.participant1Id) {
      headToHead.set(match.participant1Id, (headToHead.get(match.participant1Id) || 0) + 3);
    } else if (match.winnerId === match.participant2Id) {
      headToHead.set(match.participant2Id, (headToHead.get(match.participant2Id) || 0) + 3);
    } else {
      headToHead.set(match.participant1Id, (headToHead.get(match.participant1Id) || 0) + 1);
      headToHead.set(match.participant2Id, (headToHead.get(match.participant2Id) || 0) + 1);
    }

    const football = match.scoreDetails && typeof match.scoreDetails === 'object'
      ? (match.scoreDetails as Record<string, unknown>).football
      : null;
    const events = football && typeof football === 'object' && Array.isArray((football as Record<string, unknown>).events)
      ? (football as Record<string, unknown>).events as unknown[]
      : [];
    for (const event of events) {
      if (!event || typeof event !== 'object') continue;
      const row = event as Record<string, unknown>;
      const penalty = row.type === 'RED_CARD' ? 3 : row.type === 'YELLOW_CARD' ? 1 : 0;
      if (penalty === 0) continue;
      const target = row.team === 1 ? match.participant1Id : row.team === 2 ? match.participant2Id : null;
      if (target) fairPlay.set(target, (fairPlay.get(target) || 0) + penalty);
    }
  }

  return [...rows].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    const goalDifference = (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
    if (goalDifference !== 0) return goalDifference;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    const h2h = (headToHead.get(b.participantId) || 0) - (headToHead.get(a.participantId) || 0);
    if (h2h !== 0) return h2h;
    const fair = (fairPlay.get(a.participantId) || 0) - (fairPlay.get(b.participantId) || 0);
    if (fair !== 0) return fair;
    if (b.won !== a.won) return b.won - a.won;
    return a.participantId.localeCompare(b.participantId);
  });
}
