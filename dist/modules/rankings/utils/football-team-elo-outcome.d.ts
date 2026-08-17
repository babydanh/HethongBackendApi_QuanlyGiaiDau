export type FootballTeamEloOutcomeLabel = 'WIN' | 'LOSS' | 'DRAW' | 'FORFEIT' | 'NO_SHOW';
export interface FootballTeamEloOutcome {
    score1: 0 | 0.5 | 1;
    score2: 0 | 0.5 | 1;
    outcome1: FootballTeamEloOutcomeLabel;
    outcome2: FootballTeamEloOutcomeLabel;
}
export declare function resolveFootballTeamEloOutcome(input: {
    winnerId: string | null | undefined;
    participant1Id: string;
    participant2Id: string;
    specialAction?: string | null;
}): FootballTeamEloOutcome;
