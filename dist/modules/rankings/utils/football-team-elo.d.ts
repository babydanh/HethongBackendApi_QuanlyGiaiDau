export interface FootballTeamEloCalculation {
    expected1: number;
    expected2: number;
    delta1: number;
    delta2: number;
}
export declare function calculateFootballTeamElo(elo1: number, elo2: number, score1: 0 | 0.5 | 1, kFactor?: number): FootballTeamEloCalculation;
