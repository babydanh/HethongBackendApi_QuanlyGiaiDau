import type { AppDb, AppTx } from '../../database/db.types';
import * as schema from '../../database/schema';
import { QueryRankingDto } from './dto/query-ranking.dto';
export declare class RankingsRepository {
    private readonly db;
    constructor(db: AppDb);
    getDbInstance(): AppDb;
    getLeaderboard(query: QueryRankingDto): Promise<{
        data: {
            id: string;
            categoryId: string;
            communityId: string | null;
            matchType: string;
            genderRestriction: string | null;
            eloPoints: number;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            updatedAt: Date;
            user1: {
                id: string;
                fullName: string | null;
                avatarUrl: string | null;
            };
            user2: {
                id: string;
                fullName: string | null;
                avatarUrl: string | null;
            };
        }[];
        meta: {
            page: number;
            limit: number;
            nextCursor: string | null;
            hasMore: boolean;
        };
    } | {
        data: {
            id: string;
            userId: string;
            categoryId: string;
            communityId: string;
            matchType: string;
            genderRestriction: string | null;
            eloPoints: number;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            updatedAt: Date;
            user: {
                id: string;
                fullName: string | null;
                avatarUrl: string | null;
            };
        }[];
        meta: {
            page: number;
            limit: number;
            nextCursor: string | null;
            hasMore: boolean;
        };
    } | {
        data: {
            id: string;
            userId: string;
            categoryId: string;
            matchType: string;
            genderRestriction: string | null;
            eloPoints: number;
            matchesPlayed: number;
            matchesWon: number;
            winStreak: number;
            updatedAt: Date;
            tier: {
                id: string;
                name: string;
            } | null;
            user: {
                id: string;
                fullName: string | null;
                avatarUrl: string | null;
            };
        }[];
        meta: {
            page: number;
            limit: number;
            nextCursor: string | null;
            hasMore: boolean;
        };
    }>;
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
    getOrCreateUserRank(tx: AppTx, userId: string, categoryId: string, matchType: string, scope: 'PUBLIC' | 'COMMUNITY', communityId?: string, forUpdate?: boolean, genderRestriction?: string): Promise<{
        id: string;
        updatedAt: Date;
        userId: string;
        categoryId: string;
        communityId: string | null;
        matchType: string;
        genderRestriction: string | null;
        eloPoints: number;
        tierId: string | null;
        shieldActive: boolean;
        matchesPlayed: number;
        matchesWon: number;
        winStreak: number;
        peakElo: number;
        lastActiveAt: Date;
        lastDecayAt: Date;
    } | {
        id: string;
        updatedAt: Date;
        userId: string;
        categoryId: string;
        communityId: string;
        matchType: string;
        genderRestriction: string | null;
        eloPoints: number;
        matchesPlayed: number;
        matchesWon: number;
        winStreak: number;
        peakElo: number;
        lastActiveAt: Date;
        lastDecayAt: Date;
    }>;
    updateUserRank(tx: AppTx, id: string, data: {
        eloPoints: number;
        matchesPlayed: number;
        matchesWon: number;
        winStreak: number;
        shieldActive?: boolean;
        peakElo?: number;
        lastActiveAt?: Date;
        lastDecayAt?: Date;
    }, scope: 'PUBLIC' | 'COMMUNITY'): Promise<{
        id: string;
        communityId: string;
        userId: string;
        categoryId: string;
        matchType: string;
        genderRestriction: string | null;
        eloPoints: number;
        matchesPlayed: number;
        matchesWon: number;
        winStreak: number;
        peakElo: number;
        lastActiveAt: Date;
        lastDecayAt: Date;
        updatedAt: Date;
    }[] | {
        id: string;
        userId: string;
        categoryId: string;
        communityId: string | null;
        matchType: string;
        genderRestriction: string | null;
        eloPoints: number;
        tierId: string | null;
        shieldActive: boolean;
        matchesPlayed: number;
        matchesWon: number;
        winStreak: number;
        peakElo: number;
        lastActiveAt: Date;
        lastDecayAt: Date;
        updatedAt: Date;
    }[]>;
    private _updateUserRank;
    insertEloHistory(tx: AppTx, logs: (typeof schema.eloHistoryLogs.$inferInsert)[]): Promise<import("postgres").RowList<never[]>>;
    getEloTiersByCategory(categoryId: string): Promise<{
        id: string;
        categoryId: string;
        name: string;
        minElo: number;
        maxElo: number;
        iconUrl: string | null;
    }[]>;
    getUserProvinceCode(userId: string): Promise<string | null>;
    updateUserRankTier(tx: AppTx, rankId: string, tierId: string | null): Promise<import("postgres").RowList<never[]>>;
}
