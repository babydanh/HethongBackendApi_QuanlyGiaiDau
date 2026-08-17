export declare const FOOTBALL_TEAM_SIZES: readonly [5, 7, 11];
export type FootballTeamSize = (typeof FOOTBALL_TEAM_SIZES)[number];
export interface FootballTeamConfigResolution {
    isTeamSport: boolean;
    mainSize: number;
    maxReserve: number;
    maxTotalSize: number;
}
export interface FootballTeamConfigValidationOptions {
    requireTeamSize?: boolean;
}
export declare function assertValidFootballTeamConfig(input: unknown, options?: FootballTeamConfigValidationOptions): void;
export declare function resolveFootballTeamConfig(input: unknown): FootballTeamConfigResolution;
