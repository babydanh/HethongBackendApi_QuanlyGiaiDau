import type { AppDb } from '../../database/db.types';
export declare class FootballTeamEloService {
    private readonly db;
    private readonly kFactor;
    constructor(db: AppDb);
    getLeaderboard(categoryId: string, limit?: number, cursor?: string, communityId?: string): Promise<{
        data: {
            id: string;
            teamId: string;
            teamName: string;
            logoUrl: string | null;
            eloPoints: number;
            tierId: string | null;
            tierName: string | null;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            peakElo: number;
        }[];
        meta: {
            limit: number;
            hasMore: boolean;
            nextCursor: string | null;
        };
    }>;
    processCompletedMatch(matchId: string): Promise<{
        handled: boolean;
        alreadyProcessed?: boolean;
    }>;
}
