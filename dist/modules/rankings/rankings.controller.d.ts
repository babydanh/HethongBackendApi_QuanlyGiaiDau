import { RankingsService } from './rankings.service';
import { FootballTeamEloService } from './football-team-elo.service';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';
export declare class RankingsController {
    private readonly rankingsService;
    private readonly footballTeamEloService;
    constructor(rankingsService: RankingsService, footballTeamEloService: FootballTeamEloService);
    getFootballTeamLeaderboard(query: QueryRankingDto): Promise<{
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
    getLeaderboard(query: QueryRankingDto): Promise<any>;
    getUserRankings(userId: string): Promise<{
        publicRanks: {
            id: string;
            categoryId: string;
            categoryName: string;
            matchType: string;
            genderRestriction: string | null;
            eloPoints: number;
            shieldActive: boolean;
            peakElo: number;
            lastActiveAt: Date;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            updatedAt: Date;
            tierName: string | null;
        }[];
        communityRanks: {
            id: string;
            communityId: string;
            communityName: string;
            categoryId: string;
            categoryName: string;
            matchType: string;
            genderRestriction: string | null;
            eloPoints: number;
            peakElo: number;
            lastActiveAt: Date;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            updatedAt: Date;
        }[];
    }>;
    getEloHistory(userId: string, categoryId?: string, scope?: 'PUBLIC' | 'COMMUNITY', communityId?: string, limit?: number, cursor?: string): Promise<{
        data: {
            id: string;
            userId: string;
            categoryId: string;
            matchId: string | null;
            reason: string | null;
            previousElo: number;
            newElo: number;
            changedPoints: number;
            createdAt: Date;
            match: {
                id: string | null;
                tournamentId: string | null;
                tournamentName: string | null;
                tournamentType: string | null;
                communityId: string | null;
            };
        }[];
        meta: {
            page: number;
            limit: number;
            nextCursor: string | null;
            hasMore: boolean;
        };
    }>;
    updateElo(updateEloDto: UpdateEloDto): Promise<{
        alreadyProcessed: boolean;
        matchId: string;
        winner?: undefined;
        loser?: undefined;
    } | {
        winner: {
            newElo: number;
            changedPoints: number;
            newWinStreak: number;
            newPeakElo: number;
        };
        loser: {
            newElo: number;
            changedPoints: number;
            newWinStreak: number;
            newPeakElo: number;
        };
        alreadyProcessed?: undefined;
        matchId?: undefined;
    }>;
}
