export interface MatchBroadcastData {
  id: string;
  matchId?: string;
  status?: string;
  homeScore?: number;
  awayScore?: number;
  [key: string]: unknown;
}
