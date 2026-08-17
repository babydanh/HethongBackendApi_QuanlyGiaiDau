import { RankingsRepository } from './rankings.repository';
import { EloEngineService } from './elo-engine.service';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';
import type { AppTx, AppDb } from '../../database/db.types';
import { RedisService } from '../../providers/redis/redis.service';
import { FootballTeamEloService } from './football-team-elo.service';
type Transaction = AppTx;
export declare class RankingsService {
    private readonly db;
    private readonly rankingsRepository;
    private readonly eloEngineService;
    private readonly redisService;
    private readonly footballTeamEloService?;
    constructor(db: AppDb, rankingsRepository: RankingsRepository, eloEngineService: EloEngineService, redisService: RedisService, footballTeamEloService?: FootballTeamEloService | undefined);
    private invalidateLeaderboardCache;
    private extractScoreRatio;
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
    getEloHistory(userId: string, query: {
        categoryId?: string;
        scope?: 'PUBLIC' | 'COMMUNITY';
        communityId?: string;
        page?: number;
        limit?: number;
        cursor?: string;
    }): Promise<{
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
    updateMatchElo(dto: UpdateEloDto): Promise<{
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
    processMatchResult(matchId: string, winnerParticipantId: string, loserParticipantId: string, categoryId: string, matchType: string, scope: 'PUBLIC' | 'COMMUNITY', communityId?: string, genderRestriction?: string): Promise<{
        alreadyProcessed: boolean;
        matchId: string;
        success?: undefined;
        winnerPlayerCount?: undefined;
        loserPlayerCount?: undefined;
        doublesMode?: undefined;
    } | {
        success: boolean;
        winnerPlayerCount: number;
        loserPlayerCount: number;
        doublesMode: boolean;
        alreadyProcessed?: undefined;
        matchId?: undefined;
    } | {
        success: boolean;
        winnerPlayerCount: number;
        loserPlayerCount: number;
        alreadyProcessed?: undefined;
        matchId?: undefined;
        doublesMode?: undefined;
    } | {
        success: boolean;
        skipped: boolean;
        reason: string;
    }>;
    recalculateUserRankTier(tx: Transaction, userId: string, categoryId: string, matchType: string, genderRestriction?: string): Promise<void>;
    applyMonthlyInactivityDecay(): Promise<void>;
    recalculateCommunityRankTier(tx: Transaction, userId: string, categoryId: string, matchType: string, communityId?: string, genderRestriction?: string): Promise<void>;
    recalculateUserTiersOnProvinceChange(userId: string): Promise<void>;
    recalculateEloChain(tx: Transaction, playerIds: string[], fromTime: Date, categoryId: string, matchType: string): Promise<void>;
    recalculateEloChainSafe(playerIds: string[], fromTime: Date, categoryId: string, matchType: string): Promise<void>;
    processMatchResultFromOutbox(matchId: string): Promise<{
        alreadyProcessed: boolean;
        matchId: string;
        success?: undefined;
        winnerPlayerCount?: undefined;
        loserPlayerCount?: undefined;
        doublesMode?: undefined;
    } | {
        success: boolean;
        winnerPlayerCount: number;
        loserPlayerCount: number;
        doublesMode: boolean;
        alreadyProcessed?: undefined;
        matchId?: undefined;
    } | {
        success: boolean;
        winnerPlayerCount: number;
        loserPlayerCount: number;
        alreadyProcessed?: undefined;
        matchId?: undefined;
        doublesMode?: undefined;
    } | {
        success: boolean;
        skipped: boolean;
        reason: string;
    } | {
        handled: boolean;
        alreadyProcessed?: boolean;
    }>;
}
export {};
