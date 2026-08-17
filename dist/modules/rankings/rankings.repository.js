"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RankingsRepository = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const drizzle_orm_1 = require("drizzle-orm");
let RankingsRepository = class RankingsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getDbInstance() {
        return this.db;
    }
    async getLeaderboard(query) {
        const { page = 1, limit = 50, cursor, categoryId, matchType, communityId, scope = 'PUBLIC', provinceCode, genderRestriction } = query;
        let cursorValue = null;
        if (cursor) {
            try {
                cursorValue = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
            }
            catch {
                cursorValue = null;
            }
        }
        const applyCursor = (eloColumn, idColumn) => cursorValue
            ? (0, drizzle_orm_1.sql) `(${eloColumn} < ${cursorValue.eloPoints} OR (${eloColumn} = ${cursorValue.eloPoints} AND ${idColumn} < ${cursorValue.id}))`
            : undefined;
        const isDoubles = matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
        if (isDoubles) {
            const user1 = (0, drizzle_orm_1.aliasedTable)(schema.users, 'user1');
            const user2 = (0, drizzle_orm_1.aliasedTable)(schema.users, 'user2');
            const profile1 = (0, drizzle_orm_1.aliasedTable)(schema.profiles, 'profile1');
            const profile2 = (0, drizzle_orm_1.aliasedTable)(schema.profiles, 'profile2');
            const conditions = [
                (0, drizzle_orm_1.eq)(schema.pairRanks.categoryId, categoryId),
                (0, drizzle_orm_1.eq)(schema.pairRanks.scope, scope),
                (0, drizzle_orm_1.gt)(schema.pairRanks.matchesPlayed, 0),
                (0, drizzle_orm_1.eq)(user1.isMock, false),
                (0, drizzle_orm_1.eq)(user2.isMock, false),
            ];
            if (matchType) {
                conditions.push((0, drizzle_orm_1.eq)(schema.pairRanks.matchType, matchType));
            }
            if (genderRestriction) {
                conditions.push((0, drizzle_orm_1.eq)(schema.pairRanks.genderRestriction, genderRestriction));
            }
            if (communityId && scope === 'COMMUNITY') {
                conditions.push((0, drizzle_orm_1.eq)(schema.pairRanks.communityId, communityId));
            }
            else {
                conditions.push((0, drizzle_orm_1.isNull)(schema.pairRanks.communityId));
            }
            if (provinceCode) {
                conditions.push((0, drizzle_orm_1.sql) `(${profile1.provinceCode} = ${provinceCode} OR ${profile2.provinceCode} = ${provinceCode})`);
            }
            const whereClause = (0, drizzle_orm_1.and)(...conditions);
            const data = this.db
                .select({
                id: schema.pairRanks.id,
                categoryId: schema.pairRanks.categoryId,
                communityId: schema.pairRanks.communityId,
                matchType: schema.pairRanks.matchType,
                genderRestriction: schema.pairRanks.genderRestriction,
                eloPoints: schema.pairRanks.eloPoints,
                matchesPlayed: schema.pairRanks.matchesPlayed,
                matchesWon: schema.pairRanks.matchesWon,
                winStreak: schema.pairRanks.winStreak,
                updatedAt: schema.pairRanks.updatedAt,
                user1: {
                    id: user1.id,
                    fullName: profile1.fullName,
                    avatarUrl: profile1.avatarUrl,
                },
                user2: {
                    id: user2.id,
                    fullName: profile2.fullName,
                    avatarUrl: profile2.avatarUrl,
                },
            })
                .from(schema.pairRanks)
                .innerJoin(user1, (0, drizzle_orm_1.eq)(schema.pairRanks.user1Id, user1.id))
                .innerJoin(user2, (0, drizzle_orm_1.eq)(schema.pairRanks.user2Id, user2.id))
                .leftJoin(profile1, (0, drizzle_orm_1.eq)(user1.id, profile1.userId))
                .leftJoin(profile2, (0, drizzle_orm_1.eq)(user2.id, profile2.userId))
                .where((0, drizzle_orm_1.and)(whereClause, applyCursor(schema.pairRanks.eloPoints, schema.pairRanks.id)))
                .orderBy((0, drizzle_orm_1.desc)(schema.pairRanks.eloPoints), (0, drizzle_orm_1.desc)(schema.pairRanks.id))
                .limit(limit + 1)
                .$dynamic();
            const pairData = await data;
            const pairHasMore = pairData.length > limit;
            const pairItems = pairHasMore ? pairData.slice(0, limit) : pairData;
            const pairLast = pairItems.at(-1);
            return {
                data: pairItems,
                meta: {
                    page,
                    limit,
                    nextCursor: pairHasMore && pairLast ? Buffer.from(JSON.stringify({ eloPoints: pairLast.eloPoints, id: pairLast.id })).toString('base64url') : null,
                    hasMore: pairHasMore,
                },
            };
        }
        if (scope === 'COMMUNITY') {
            if (!communityId) {
                throw new common_1.BadRequestException('communityId is required when scope is COMMUNITY');
            }
            const conditions = [
                (0, drizzle_orm_1.eq)(schema.communityRankings.categoryId, categoryId),
                (0, drizzle_orm_1.eq)(schema.communityRankings.communityId, communityId),
                (0, drizzle_orm_1.eq)(schema.users.isMock, false),
                (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED'),
            ];
            if (matchType) {
                conditions.push((0, drizzle_orm_1.eq)(schema.communityRankings.matchType, matchType));
            }
            if (genderRestriction) {
                conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.communityRankings.genderRestriction, genderRestriction), (0, drizzle_orm_1.isNull)(schema.communityRankings.genderRestriction)));
            }
            if (provinceCode) {
                conditions.push((0, drizzle_orm_1.eq)(schema.profiles.provinceCode, provinceCode));
            }
            const whereClause = (0, drizzle_orm_1.and)(...conditions);
            const data = this.db
                .select({
                id: schema.communityRankings.id,
                userId: schema.communityRankings.userId,
                categoryId: schema.communityRankings.categoryId,
                communityId: schema.communityRankings.communityId,
                matchType: schema.communityRankings.matchType,
                genderRestriction: schema.communityRankings.genderRestriction,
                eloPoints: schema.communityRankings.eloPoints,
                matchesPlayed: schema.communityRankings.matchesPlayed,
                matchesWon: schema.communityRankings.matchesWon,
                winStreak: schema.communityRankings.winStreak,
                updatedAt: schema.communityRankings.updatedAt,
                user: {
                    id: schema.users.id,
                    fullName: schema.profiles.fullName,
                    avatarUrl: schema.profiles.avatarUrl,
                },
            })
                .from(schema.communityRankings)
                .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityRankings.userId, schema.users.id))
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
                .innerJoin(schema.communityMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityRankings.userId, schema.communityMembers.userId), (0, drizzle_orm_1.eq)(schema.communityRankings.communityId, schema.communityMembers.communityId)))
                .where((0, drizzle_orm_1.and)(whereClause, applyCursor(schema.communityRankings.eloPoints, schema.communityRankings.id)))
                .orderBy((0, drizzle_orm_1.desc)(schema.communityRankings.eloPoints), (0, drizzle_orm_1.desc)(schema.communityRankings.id))
                .limit(limit + 1)
                .$dynamic();
            const communityData = await data;
            const communityHasMore = communityData.length > limit;
            const communityItems = communityHasMore ? communityData.slice(0, limit) : communityData;
            const communityLast = communityItems.at(-1);
            return {
                data: communityItems,
                meta: {
                    page,
                    limit,
                    nextCursor: communityHasMore && communityLast ? Buffer.from(JSON.stringify({ eloPoints: communityLast.eloPoints, id: communityLast.id })).toString('base64url') : null,
                    hasMore: communityHasMore,
                },
            };
        }
        else {
            const conditions = [
                (0, drizzle_orm_1.eq)(schema.userRanks.categoryId, categoryId),
                (0, drizzle_orm_1.isNull)(schema.userRanks.communityId),
                (0, drizzle_orm_1.eq)(schema.users.isMock, false),
                (0, drizzle_orm_1.gt)(schema.userRanks.matchesPlayed, 0),
            ];
            if (matchType) {
                conditions.push((0, drizzle_orm_1.eq)(schema.userRanks.matchType, matchType));
            }
            if (genderRestriction) {
                conditions.push((0, drizzle_orm_1.eq)(schema.userRanks.genderRestriction, genderRestriction));
            }
            if (provinceCode) {
                conditions.push((0, drizzle_orm_1.eq)(schema.profiles.provinceCode, provinceCode));
            }
            const whereClause = (0, drizzle_orm_1.and)(...conditions);
            const data = this.db
                .select({
                id: schema.userRanks.id,
                userId: schema.userRanks.userId,
                categoryId: schema.userRanks.categoryId,
                matchType: schema.userRanks.matchType,
                genderRestriction: schema.userRanks.genderRestriction,
                eloPoints: schema.userRanks.eloPoints,
                matchesPlayed: schema.userRanks.matchesPlayed,
                matchesWon: schema.userRanks.matchesWon,
                winStreak: schema.userRanks.winStreak,
                updatedAt: schema.userRanks.updatedAt,
                tier: {
                    id: schema.eloTiers.id,
                    name: schema.eloTiers.name,
                },
                user: {
                    id: schema.users.id,
                    fullName: schema.profiles.fullName,
                    avatarUrl: schema.profiles.avatarUrl,
                },
            })
                .from(schema.userRanks)
                .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.userRanks.userId, schema.users.id))
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
                .leftJoin(schema.eloTiers, (0, drizzle_orm_1.eq)(schema.userRanks.tierId, schema.eloTiers.id))
                .where((0, drizzle_orm_1.and)(whereClause, applyCursor(schema.userRanks.eloPoints, schema.userRanks.id)))
                .orderBy((0, drizzle_orm_1.desc)(schema.userRanks.eloPoints), (0, drizzle_orm_1.desc)(schema.userRanks.id))
                .limit(limit + 1)
                .$dynamic();
            const publicData = await data;
            const publicHasMore = publicData.length > limit;
            const publicItems = publicHasMore ? publicData.slice(0, limit) : publicData;
            const publicLast = publicItems.at(-1);
            return {
                data: publicItems,
                meta: {
                    page,
                    limit,
                    nextCursor: publicHasMore && publicLast ? Buffer.from(JSON.stringify({ eloPoints: publicLast.eloPoints, id: publicLast.id })).toString('base64url') : null,
                    hasMore: publicHasMore,
                },
            };
        }
    }
    async getUserRankings(userId) {
        const [rankableUser] = await this.db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.id, userId), (0, drizzle_orm_1.eq)(schema.users.isMock, false)))
            .limit(1);
        if (!rankableUser) {
            return { publicRanks: [], communityRanks: [] };
        }
        const publicRanks = await this.db
            .select({
            id: schema.userRanks.id,
            categoryId: schema.userRanks.categoryId,
            categoryName: schema.categories.name,
            matchType: schema.userRanks.matchType,
            genderRestriction: schema.userRanks.genderRestriction,
            eloPoints: schema.userRanks.eloPoints,
            shieldActive: schema.userRanks.shieldActive,
            peakElo: schema.userRanks.peakElo,
            lastActiveAt: schema.userRanks.lastActiveAt,
            matchesPlayed: schema.userRanks.matchesPlayed,
            matchesWon: schema.userRanks.matchesWon,
            winStreak: schema.userRanks.winStreak,
            updatedAt: schema.userRanks.updatedAt,
            tierName: schema.eloTiers.name,
        })
            .from(schema.userRanks)
            .innerJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.userRanks.categoryId, schema.categories.id))
            .leftJoin(schema.eloTiers, (0, drizzle_orm_1.eq)(schema.userRanks.tierId, schema.eloTiers.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userRanks.userId, userId), (0, drizzle_orm_1.isNull)(schema.userRanks.communityId)));
        const communityRanks = await this.db
            .select({
            id: schema.communityRankings.id,
            communityId: schema.communityRankings.communityId,
            communityName: schema.communities.name,
            categoryId: schema.communityRankings.categoryId,
            categoryName: schema.categories.name,
            matchType: schema.communityRankings.matchType,
            genderRestriction: schema.communityRankings.genderRestriction,
            eloPoints: schema.communityRankings.eloPoints,
            peakElo: schema.communityRankings.peakElo,
            lastActiveAt: schema.communityRankings.lastActiveAt,
            matchesPlayed: schema.communityRankings.matchesPlayed,
            matchesWon: schema.communityRankings.matchesWon,
            winStreak: schema.communityRankings.winStreak,
            updatedAt: schema.communityRankings.updatedAt,
        })
            .from(schema.communityRankings)
            .innerJoin(schema.communities, (0, drizzle_orm_1.eq)(schema.communityRankings.communityId, schema.communities.id))
            .innerJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.communityRankings.categoryId, schema.categories.id))
            .where((0, drizzle_orm_1.eq)(schema.communityRankings.userId, userId));
        return {
            publicRanks,
            communityRanks,
        };
    }
    async getEloHistory(userId, query) {
        const { categoryId, scope = 'PUBLIC', communityId, page = 1, limit = 20, cursor } = query;
        const conditions = [(0, drizzle_orm_1.eq)(schema.eloHistoryLogs.userId, userId)];
        if (categoryId) {
            conditions.push((0, drizzle_orm_1.eq)(schema.eloHistoryLogs.categoryId, categoryId));
        }
        if (scope === 'COMMUNITY') {
            if (!communityId) {
                throw new common_1.BadRequestException('communityId is required when scope is COMMUNITY');
            }
            conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.communityId, communityId));
            conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.tournamentType, 'CLUB'));
        }
        else {
            conditions.push((0, drizzle_orm_1.sql) `(${schema.eloHistoryLogs.matchId} IS NULL OR ${schema.tournaments.tournamentType} = 'PUBLIC')`);
        }
        const whereClause = (0, drizzle_orm_1.and)(...conditions);
        let historyWhere = whereClause;
        let historyCursor = null;
        if (cursor) {
            try {
                historyCursor = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
            }
            catch {
                historyCursor = null;
            }
        }
        if (historyCursor) {
            const cursorDate = new Date(historyCursor.createdAt);
            historyWhere = (0, drizzle_orm_1.and)(whereClause, (0, drizzle_orm_1.sql) `(${schema.eloHistoryLogs.createdAt} < ${cursorDate} OR (${schema.eloHistoryLogs.createdAt} = ${cursorDate} AND ${schema.eloHistoryLogs.id} < ${historyCursor.id}))`);
        }
        const data = this.db
            .select({
            id: schema.eloHistoryLogs.id,
            userId: schema.eloHistoryLogs.userId,
            categoryId: schema.eloHistoryLogs.categoryId,
            matchId: schema.eloHistoryLogs.matchId,
            reason: schema.eloHistoryLogs.reason,
            previousElo: schema.eloHistoryLogs.previousElo,
            newElo: schema.eloHistoryLogs.newElo,
            changedPoints: schema.eloHistoryLogs.changedPoints,
            createdAt: schema.eloHistoryLogs.createdAt,
            match: {
                id: schema.matches.id,
                tournamentId: schema.tournaments.id,
                tournamentName: schema.tournaments.name,
                tournamentType: schema.tournaments.tournamentType,
                communityId: schema.tournaments.communityId,
            }
        })
            .from(schema.eloHistoryLogs)
            .leftJoin(schema.matches, (0, drizzle_orm_1.eq)(schema.eloHistoryLogs.matchId, schema.matches.id))
            .leftJoin(schema.tournamentGroups, (0, drizzle_orm_1.eq)(schema.matches.groupId, schema.tournamentGroups.id))
            .leftJoin(schema.tournamentStages, (0, drizzle_orm_1.eq)(schema.tournamentGroups.stageId, schema.tournamentStages.id))
            .leftJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, schema.tournaments.id))
            .where(historyWhere)
            .orderBy((0, drizzle_orm_1.desc)(schema.eloHistoryLogs.createdAt), (0, drizzle_orm_1.desc)(schema.eloHistoryLogs.id))
            .limit(limit + 1)
            .$dynamic();
        const historyData = await data;
        const historyHasMore = historyData.length > limit;
        const historyItems = historyHasMore ? historyData.slice(0, limit) : historyData;
        const historyLast = historyItems.at(-1);
        return {
            data: historyItems,
            meta: {
                page,
                limit,
                nextCursor: historyHasMore && historyLast ? Buffer.from(JSON.stringify({ createdAt: historyLast.createdAt.toISOString(), id: historyLast.id })).toString('base64url') : null,
                hasMore: historyHasMore,
            }
        };
    }
    async getOrCreateUserRank(tx, userId, categoryId, matchType, scope, communityId, forUpdate = false, genderRestriction) {
        if (scope === 'COMMUNITY') {
            if (!communityId)
                throw new common_1.BadRequestException('communityId is required for COMMUNITY scope');
            const conditions = [
                (0, drizzle_orm_1.eq)(schema.communityRankings.userId, userId),
                (0, drizzle_orm_1.eq)(schema.communityRankings.categoryId, categoryId),
                (0, drizzle_orm_1.eq)(schema.communityRankings.communityId, communityId),
                (0, drizzle_orm_1.eq)(schema.communityRankings.matchType, matchType),
                genderRestriction
                    ? (0, drizzle_orm_1.eq)(schema.communityRankings.genderRestriction, genderRestriction)
                    : (0, drizzle_orm_1.isNull)(schema.communityRankings.genderRestriction),
            ];
            const existing = forUpdate
                ? await tx.select().from(schema.communityRankings).where((0, drizzle_orm_1.and)(...conditions)).for('update').limit(1)
                : await tx.select().from(schema.communityRankings).where((0, drizzle_orm_1.and)(...conditions)).limit(1);
            if (existing.length > 0)
                return existing[0];
            const [newRank] = await tx
                .insert(schema.communityRankings)
                .values({
                userId,
                categoryId,
                communityId,
                matchType,
                genderRestriction: genderRestriction || null,
                eloPoints: 1000,
                matchesPlayed: 0,
                matchesWon: 0,
                winStreak: 0,
            })
                .returning();
            return newRank;
        }
        else {
            const conditions = [
                (0, drizzle_orm_1.eq)(schema.userRanks.userId, userId),
                (0, drizzle_orm_1.eq)(schema.userRanks.categoryId, categoryId),
                (0, drizzle_orm_1.eq)(schema.userRanks.matchType, matchType),
                (0, drizzle_orm_1.isNull)(schema.userRanks.communityId),
                genderRestriction
                    ? (0, drizzle_orm_1.eq)(schema.userRanks.genderRestriction, genderRestriction)
                    : (0, drizzle_orm_1.isNull)(schema.userRanks.genderRestriction),
            ];
            const existing = forUpdate
                ? await tx.select().from(schema.userRanks).where((0, drizzle_orm_1.and)(...conditions)).for('update').limit(1)
                : await tx.select().from(schema.userRanks).where((0, drizzle_orm_1.and)(...conditions)).limit(1);
            if (existing.length > 0)
                return existing[0];
            const [newRank] = await tx
                .insert(schema.userRanks)
                .values({
                userId,
                categoryId,
                matchType,
                genderRestriction: genderRestriction || null,
                eloPoints: 1000,
                matchesPlayed: 0,
                matchesWon: 0,
                winStreak: 0,
            })
                .returning();
            return newRank;
        }
    }
    async updateUserRank(tx, id, data, scope) {
        const setData = {
            eloPoints: data.eloPoints,
            matchesPlayed: data.matchesPlayed,
            matchesWon: data.matchesWon,
            winStreak: data.winStreak,
            updatedAt: new Date(),
        };
        if (data.peakElo !== undefined)
            setData.peakElo = data.peakElo;
        if (data.lastActiveAt !== undefined)
            setData.lastActiveAt = data.lastActiveAt;
        if (data.lastDecayAt !== undefined)
            setData.lastDecayAt = data.lastDecayAt;
        if (scope === 'COMMUNITY') {
            return tx
                .update(schema.communityRankings)
                .set(setData)
                .where((0, drizzle_orm_1.eq)(schema.communityRankings.id, id))
                .returning();
        }
        else {
            return tx
                .update(schema.userRanks)
                .set(setData)
                .where((0, drizzle_orm_1.eq)(schema.userRanks.id, id))
                .returning();
        }
    }
    async _updateUserRank(tx, id, data, scope) {
        if (scope === 'COMMUNITY') {
            return tx
                .update(schema.communityRankings)
                .set({
                eloPoints: data.eloPoints,
                matchesPlayed: data.matchesPlayed,
                matchesWon: data.matchesWon,
                winStreak: data.winStreak,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema.communityRankings.id, id))
                .returning();
        }
        else {
            return tx
                .update(schema.userRanks)
                .set({
                eloPoints: data.eloPoints,
                matchesPlayed: data.matchesPlayed,
                matchesWon: data.matchesWon,
                winStreak: data.winStreak,
                ...(data.shieldActive !== undefined && { shieldActive: data.shieldActive }),
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema.userRanks.id, id))
                .returning();
        }
    }
    async insertEloHistory(tx, logs) {
        const matchIds = [...new Set(logs.map((log) => log.matchId).filter((id) => Boolean(id)))];
        const tournamentByMatch = new Map();
        if (matchIds.length > 0) {
            const matches = await tx
                .select({ id: schema.matches.id, tournamentId: schema.matches.tournamentId })
                .from(schema.matches)
                .where((0, drizzle_orm_1.inArray)(schema.matches.id, matchIds));
            for (const match of matches)
                tournamentByMatch.set(match.id, match.tournamentId);
        }
        const enrichedLogs = logs.map((log) => ({
            ...log,
            tournamentId: log.tournamentId ?? (log.matchId ? tournamentByMatch.get(log.matchId) ?? null : null),
        }));
        return tx.insert(schema.eloHistoryLogs).values(enrichedLogs).onConflictDoNothing();
    }
    async getEloTiersByCategory(categoryId) {
        return this.db
            .select()
            .from(schema.eloTiers)
            .where((0, drizzle_orm_1.eq)(schema.eloTiers.categoryId, categoryId));
    }
    async getUserProvinceCode(userId) {
        const profile = await this.db
            .select({ provinceCode: schema.profiles.provinceCode })
            .from(schema.profiles)
            .where((0, drizzle_orm_1.eq)(schema.profiles.userId, userId))
            .limit(1)
            .then((rows) => rows[0]);
        return profile?.provinceCode || null;
    }
    async updateUserRankTier(tx, rankId, tierId) {
        return tx
            .update(schema.userRanks)
            .set({ tierId })
            .where((0, drizzle_orm_1.eq)(schema.userRanks.id, rankId));
    }
};
exports.RankingsRepository = RankingsRepository;
exports.RankingsRepository = RankingsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], RankingsRepository);
//# sourceMappingURL=rankings.repository.js.map