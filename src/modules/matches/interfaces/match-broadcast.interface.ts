export interface MatchBroadcastData {
  id: string;
  matchId?: string;
  tournamentId?: string;
  divisionId?: string | null;
  status?: string;
  homeScore?: number;
  awayScore?: number;
  [key: string]: unknown;
}
