export interface FootballLegSnapshot {
    participant1Id: string | null;
    participant2Id: string | null;
    p1SetsWon: number | null | undefined;
    p2SetsWon: number | null | undefined;
    scoreDetails: unknown;
}
export interface FootballTwoLegAggregate {
    participant1Id: string | null;
    participant2Id: string | null;
    participant1Goals: number;
    participant2Goals: number;
    winnerId: string | null;
}
export declare function aggregateFootballTwoLegs(leg1: FootballLegSnapshot, leg2: FootballLegSnapshot, shootoutWinnerId?: string | null): FootballTwoLegAggregate;
