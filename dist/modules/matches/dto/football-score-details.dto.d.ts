export declare const FOOTBALL_PHASES: readonly ["FIRST_HALF", "HALFTIME", "SECOND_HALF", "STOPPAGE_TIME", "FULL_TIME", "EXTRA_TIME_FIRST_HALF", "EXTRA_TIME_BREAK", "EXTRA_TIME_SECOND_HALF", "PENALTY_SHOOTOUT", "COMPLETED"];
export type FootballPhase = (typeof FOOTBALL_PHASES)[number];
export declare class FootballShootoutDto {
    team1Goals: number;
    team2Goals: number;
    winnerId?: string;
}
export declare class FootballEventDto {
    type: string;
    team: 1 | 2;
    minute?: number;
    addedMinute?: number;
}
export declare class FootballScoreDetailsDto {
    team1Goals: number;
    team2Goals: number;
    phase: FootballPhase;
    minute?: number;
    addedMinute?: number;
    shootout?: FootballShootoutDto;
    events?: FootballEventDto[];
}
