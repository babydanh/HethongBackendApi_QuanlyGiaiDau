export interface MatchNode {
  id: string;
  groupId: string;
  roundNumber: number;
  matchOrder: number;
  bracketBranch: string;
  status: string;
  nextMatchId: string | null;
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  p1SetsWon: number;
  p2SetsWon: number;
  totalSetsPlayed: number;
}
