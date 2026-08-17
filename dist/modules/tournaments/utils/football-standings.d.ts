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
export declare function hasFootballScoreSnapshot(matches: readonly Pick<FootballStandingMatch, 'scoreDetails'>[]): boolean;
export declare function sortFootballStandings<T extends FootballStandingRow>(rows: T[], matches: FootballStandingMatch[]): T[];
