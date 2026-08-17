export declare class UpdateMatchScheduleDto {
    courtName?: string;
    courtAddress?: string;
    refereeId?: string;
    scheduledAt?: string;
    matchConfig?: {
        bestOf?: number;
        setsToWin?: number;
        pointsPerSet?: number;
        deuceEnabled?: boolean;
        tiebreakAt?: number;
        maxPoints?: number;
    };
}
