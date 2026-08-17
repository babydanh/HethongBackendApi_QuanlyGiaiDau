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
exports.SeriesRepository = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const drizzle_orm_1 = require("drizzle-orm");
let SeriesRepository = class SeriesRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getDbInstance() {
        return this.db;
    }
    async create(userId, data) {
        const [record] = await this.db
            .insert(schema.tournamentSeries)
            .values({
            organizerId: userId,
            name: data.name,
            slug: data.slug,
            description: data.description || null,
            bannerUrl: data.bannerUrl || null,
            logoUrl: data.logoUrl || null,
            startDate: data.startDate ? new Date(data.startDate) : null,
            endDate: data.endDate ? new Date(data.endDate) : null,
            totalPrize: data.totalPrize ? data.totalPrize.toString() : null,
            rules: data.rules,
            visibility: data.visibility || 'PUBLIC',
            status: 'DRAFT',
        })
            .returning();
        return record;
    }
    async update(id, data) {
        const [record] = await this.db
            .update(schema.tournamentSeries)
            .set({
            ...(data.name !== undefined && { name: data.name }),
            ...(data.slug !== undefined && { slug: data.slug }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
            ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
            ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
            ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
            ...(data.totalPrize !== undefined && { totalPrize: data.totalPrize ? data.totalPrize.toString() : null }),
            ...(data.rules !== undefined && { rules: data.rules }),
            ...(data.visibility !== undefined && { visibility: data.visibility }),
            ...(data.status !== undefined && { status: data.status }),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.tournamentSeries.id, id))
            .returning();
        return record;
    }
    async softDelete(id) {
        const [record] = await this.db
            .update(schema.tournamentSeries)
            .set({ deletedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.tournamentSeries.id, id))
            .returning();
        return record;
    }
    async findById(id) {
        const result = await this.db
            .select()
            .from(schema.tournamentSeries)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentSeries.id, id), (0, drizzle_orm_1.sql) `${schema.tournamentSeries.deletedAt} IS NULL`))
            .limit(1);
        return result[0] || null;
    }
    async findBySlug(slug) {
        const result = await this.db
            .select({
            series: schema.tournamentSeries,
            organizer: {
                id: schema.users.id,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            }
        })
            .from(schema.tournamentSeries)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.tournamentSeries.organizerId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentSeries.slug, slug), (0, drizzle_orm_1.sql) `${schema.tournamentSeries.deletedAt} IS NULL`))
            .limit(1);
        if (result.length === 0)
            return null;
        return result[0];
    }
    async findAll(query) {
        const conditions = [(0, drizzle_orm_1.sql) `${schema.tournamentSeries.deletedAt} IS NULL`];
        if (query.status) {
            conditions.push((0, drizzle_orm_1.eq)(schema.tournamentSeries.status, query.status));
        }
        if (query.visibility) {
            conditions.push((0, drizzle_orm_1.eq)(schema.tournamentSeries.visibility, query.visibility));
        }
        if (query.organizerId) {
            conditions.push((0, drizzle_orm_1.eq)(schema.tournamentSeries.organizerId, query.organizerId));
        }
        if (query.search) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema.tournamentSeries.name, `%${query.search}%`), (0, drizzle_orm_1.ilike)(schema.tournamentSeries.description, `%${query.search}%`)));
        }
        const baseWhereClause = (0, drizzle_orm_1.and)(...conditions);
        let whereClause = baseWhereClause;
        if (query.cursor) {
            try {
                const cursorValue = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
                const cursorDate = new Date(cursorValue.createdAt);
                whereClause = (0, drizzle_orm_1.and)(whereClause, (0, drizzle_orm_1.sql) `(${schema.tournamentSeries.createdAt} < ${cursorDate} OR (${schema.tournamentSeries.createdAt} = ${cursorDate} AND ${schema.tournamentSeries.id} < ${cursorValue.id}))`);
            }
            catch {
            }
        }
        const limit = query.limit || 10;
        const page = query.page || 1;
        const cursor = query.cursor;
        const [{ count: total }] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema.tournamentSeries)
            .where(baseWhereClause);
        let seriesQuery = this.db
            .select()
            .from(schema.tournamentSeries)
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema.tournamentSeries.createdAt), (0, drizzle_orm_1.desc)(schema.tournamentSeries.id))
            .limit(limit + 1)
            .$dynamic();
        const rows = await seriesQuery;
        const hasMore = rows.length > limit;
        const items = hasMore ? rows.slice(0, limit) : rows;
        const lastItem = items.at(-1);
        const nextCursor = hasMore && lastItem
            ? Buffer.from(JSON.stringify({ createdAt: lastItem.createdAt.toISOString(), id: lastItem.id })).toString('base64url')
            : null;
        return {
            data: items,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                nextCursor,
                hasMore,
            }
        };
    }
    async createLeg(seriesId, data) {
        const [record] = await this.db
            .insert(schema.seriesLegs)
            .values({
            seriesId,
            name: data.name,
            order: data.order,
            startDate: data.startDate ? new Date(data.startDate) : null,
            endDate: data.endDate ? new Date(data.endDate) : null,
            directEntrySlots: data.directEntrySlots !== undefined ? data.directEntrySlots : 2,
            wildcardSlots: data.wildcardSlots !== undefined ? data.wildcardSlots : 16,
            rulesOverride: data.rulesOverride,
            status: 'UPCOMING',
        })
            .returning();
        return record;
    }
    async updateLeg(legId, data) {
        const [record] = await this.db
            .update(schema.seriesLegs)
            .set({
            ...(data.name !== undefined && { name: data.name }),
            ...(data.order !== undefined && { order: data.order }),
            ...(data.startDate !== undefined && { startDate: data.startDate ? new Date(data.startDate) : null }),
            ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
            ...(data.directEntrySlots !== undefined && { directEntrySlots: data.directEntrySlots }),
            ...(data.wildcardSlots !== undefined && { wildcardSlots: data.wildcardSlots }),
            ...(data.rulesOverride !== undefined && { rulesOverride: data.rulesOverride }),
            ...(data.status !== undefined && { status: data.status }),
        })
            .where((0, drizzle_orm_1.eq)(schema.seriesLegs.id, legId))
            .returning();
        return record;
    }
    async deleteLeg(legId) {
        const [record] = await this.db
            .delete(schema.seriesLegs)
            .where((0, drizzle_orm_1.eq)(schema.seriesLegs.id, legId))
            .returning();
        return record;
    }
    async findLegsBySeriesId(seriesId) {
        return this.db
            .select()
            .from(schema.seriesLegs)
            .where((0, drizzle_orm_1.eq)(schema.seriesLegs.seriesId, seriesId))
            .orderBy(schema.seriesLegs.order);
    }
    async findLegById(legId) {
        const result = await this.db
            .select()
            .from(schema.seriesLegs)
            .where((0, drizzle_orm_1.eq)(schema.seriesLegs.id, legId))
            .limit(1);
        return result[0] || null;
    }
    async linkTournament(legId, data) {
        const [record] = await this.db
            .insert(schema.seriesEvents)
            .values({
            legId,
            tournamentId: data.tournamentId,
            region: data.region || null,
            order: data.order,
            pointMultiplier: data.pointMultiplier !== undefined ? data.pointMultiplier : 1.0,
        })
            .returning();
        return record;
    }
    async unlinkTournament(eventId) {
        const [record] = await this.db
            .delete(schema.seriesEvents)
            .where((0, drizzle_orm_1.eq)(schema.seriesEvents.id, eventId))
            .returning();
        return record;
    }
    async findEventsByLegId(legId) {
        return this.db
            .select({
            event: schema.seriesEvents,
            tournament: schema.tournaments,
        })
            .from(schema.seriesEvents)
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.seriesEvents.tournamentId, schema.tournaments.id))
            .where((0, drizzle_orm_1.eq)(schema.seriesEvents.legId, legId))
            .orderBy(schema.seriesEvents.order);
    }
    async findEventByTournamentId(tournamentId) {
        const result = await this.db
            .select({
            event: schema.seriesEvents,
            leg: schema.seriesLegs,
            series: schema.tournamentSeries,
            tournament: schema.tournaments,
        })
            .from(schema.seriesEvents)
            .innerJoin(schema.seriesLegs, (0, drizzle_orm_1.eq)(schema.seriesEvents.legId, schema.seriesLegs.id))
            .innerJoin(schema.tournamentSeries, (0, drizzle_orm_1.eq)(schema.seriesLegs.seriesId, schema.tournamentSeries.id))
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.seriesEvents.tournamentId, schema.tournaments.id))
            .where((0, drizzle_orm_1.eq)(schema.seriesEvents.tournamentId, tournamentId))
            .limit(1);
        return result[0] || null;
    }
    async getStandings(legId, categoryId, limit = 50, page = 1, cursor) {
        const conditions = [(0, drizzle_orm_1.eq)(schema.seriesStandings.legId, legId)];
        if (categoryId) {
            conditions.push((0, drizzle_orm_1.eq)(schema.seriesStandings.categoryId, categoryId));
        }
        const whereClause = (0, drizzle_orm_1.and)(...conditions);
        const [{ count: total }] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema.seriesStandings)
            .where(whereClause);
        let standingsWhere = whereClause;
        let cursorValue = null;
        if (cursor) {
            try {
                cursorValue = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
            }
            catch {
                cursorValue = null;
            }
        }
        if (cursorValue) {
            standingsWhere = (0, drizzle_orm_1.and)(whereClause, (0, drizzle_orm_1.sql) `(${schema.seriesStandings.totalPsrPoints} < ${cursorValue.totalPsrPoints} OR (${schema.seriesStandings.totalPsrPoints} = ${cursorValue.totalPsrPoints} AND ${schema.seriesStandings.id} < ${cursorValue.id}))`);
        }
        const data = this.db
            .select({
            standing: schema.seriesStandings,
            user: {
                id: schema.users.id,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
                email: schema.users.email,
            },
            category: schema.categories,
        })
            .from(schema.seriesStandings)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.seriesStandings.userId, schema.users.id))
            .innerJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .innerJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.seriesStandings.categoryId, schema.categories.id))
            .where(standingsWhere)
            .orderBy((0, drizzle_orm_1.desc)(schema.seriesStandings.totalPsrPoints), (0, drizzle_orm_1.desc)(schema.seriesStandings.id))
            .limit(limit + 1)
            .$dynamic();
        const allStandings = await data;
        const hasMore = allStandings.length > limit;
        const standings = hasMore ? allStandings.slice(0, limit) : allStandings;
        const lastStanding = standings.at(-1)?.standing;
        return {
            data: standings,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                nextCursor: hasMore && lastStanding ? Buffer.from(JSON.stringify({ totalPsrPoints: lastStanding.totalPsrPoints, id: lastStanding.id })).toString('base64url') : null,
                hasMore,
            }
        };
    }
    async getStandingForUser(legId, userId, categoryId) {
        const result = await this.db
            .select()
            .from(schema.seriesStandings)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.seriesStandings.legId, legId), (0, drizzle_orm_1.eq)(schema.seriesStandings.userId, userId), (0, drizzle_orm_1.eq)(schema.seriesStandings.categoryId, categoryId)))
            .limit(1);
        return result[0] || null;
    }
    async createStanding(legId, userId, categoryId) {
        const [record] = await this.db
            .insert(schema.seriesStandings)
            .values({
            legId,
            userId,
            categoryId,
            totalPsrPoints: 0,
            eventsPlayed: 0,
            directEntry: false,
            wildcardEntry: false,
            lockedOut: false,
        })
            .returning();
        return record;
    }
    async updateStandingPoints(standingId, pointsToAdd, bestRank, isDirect, qualifiedEventId) {
        const [record] = await this.db
            .update(schema.seriesStandings)
            .set({
            totalPsrPoints: (0, drizzle_orm_1.sql) `${schema.seriesStandings.totalPsrPoints} + ${pointsToAdd}`,
            eventsPlayed: (0, drizzle_orm_1.sql) `${schema.seriesStandings.eventsPlayed} + 1`,
            bestRank: (0, drizzle_orm_1.sql) `CASE WHEN ${schema.seriesStandings.bestRank} IS NULL THEN ${bestRank} ELSE LEAST(${schema.seriesStandings.bestRank}, ${bestRank}) END`,
            ...(isDirect && {
                directEntry: true,
                lockedOut: true,
                qualifiedEventId
            }),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.seriesStandings.id, standingId))
            .returning();
        return record;
    }
    async createPointLog(standingId, eventId, participantId, rankAchieved, basePoints, multiplier, totalPoints, isDirectEntry) {
        const [record] = await this.db
            .insert(schema.psrPointLogs)
            .values({
            standingId,
            eventId,
            participantId,
            rankAchieved,
            basePoints,
            multiplier,
            totalPoints,
            isDirectEntry,
        })
            .returning();
        return record;
    }
    async getPointLogsByStanding(standingId) {
        return this.db
            .select({
            log: schema.psrPointLogs,
            event: schema.seriesEvents,
            tournament: schema.tournaments,
        })
            .from(schema.psrPointLogs)
            .innerJoin(schema.seriesEvents, (0, drizzle_orm_1.eq)(schema.psrPointLogs.eventId, schema.seriesEvents.id))
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.seriesEvents.tournamentId, schema.tournaments.id))
            .where((0, drizzle_orm_1.eq)(schema.psrPointLogs.standingId, standingId))
            .orderBy((0, drizzle_orm_1.desc)(schema.psrPointLogs.createdAt));
    }
    async getTournamentRosterRankings(tournamentId) {
        const completedMatches = await this.db
            .select({
            match: schema.matches,
            group: schema.tournamentGroups,
            stage: schema.tournamentStages
        })
            .from(schema.matches)
            .innerJoin(schema.tournamentGroups, (0, drizzle_orm_1.eq)(schema.matches.groupId, schema.tournamentGroups.id))
            .innerJoin(schema.tournamentStages, (0, drizzle_orm_1.eq)(schema.tournamentGroups.stageId, schema.tournamentStages.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.matches.status, 'COMPLETED')))
            .orderBy((0, drizzle_orm_1.desc)(schema.tournamentStages.order), (0, drizzle_orm_1.desc)(schema.matches.roundNumber));
        const finalMatch = completedMatches.find(m => m.stage.type === 'SINGLE_ELIMINATION' && !m.match.nextMatchId);
        const rankings = [];
        if (finalMatch) {
            const winnerId = finalMatch.match.winnerId;
            const p1Id = finalMatch.match.participant1Id;
            const p2Id = finalMatch.match.participant2Id;
            if (winnerId) {
                rankings.push({ participantId: winnerId, rank: 1 });
                const runnerUpId = winnerId === p1Id ? p2Id : p1Id;
                if (runnerUpId) {
                    rankings.push({ participantId: runnerUpId, rank: 2 });
                }
            }
        }
        const participants = await this.db
            .select()
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.sql) `${schema.tournamentParticipants.teamStatus} != 'WITHDRAWN'`));
        for (const p of participants) {
            if (!rankings.some(r => r.participantId === p.id)) {
                const lostMatch = completedMatches.find(m => (m.match.participant1Id === p.id || m.match.participant2Id === p.id) &&
                    m.match.winnerId !== p.id);
                let rank = 17;
                if (lostMatch) {
                    const round = lostMatch.match.roundNumber;
                    if (round === 3)
                        rank = 3;
                    else if (round === 2)
                        rank = 5;
                    else if (round === 1)
                        rank = 9;
                }
                rankings.push({ participantId: p.id, rank });
            }
        }
        const results = [];
        for (const r of rankings) {
            const rosters = await this.db
                .select()
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, r.participantId));
            const participantMatches = completedMatches.filter(m => (m.match.participant1Id === r.participantId || m.match.participant2Id === r.participantId) &&
                !m.match.isBye &&
                !m.match.scoreDetails?.walkover &&
                !m.match.scoreDetails?.isWalkover);
            const isWalkover = participantMatches.length === 0;
            for (const rost of rosters) {
                results.push({
                    userId: rost.userId,
                    participantId: r.participantId,
                    rank: r.rank,
                    isWalkover
                });
            }
        }
        return results;
    }
    async resetSeason(seriesId) {
        await this.db.transaction(async (tx) => {
            const legs = await tx
                .select({ id: schema.seriesLegs.id })
                .from(schema.seriesLegs)
                .where((0, drizzle_orm_1.eq)(schema.seriesLegs.seriesId, seriesId));
            const legIds = legs.map((l) => l.id);
            if (legIds.length === 0)
                return;
            await tx
                .update(schema.seriesStandings)
                .set({
                totalPsrPoints: 0,
                eventsPlayed: 0,
                bestRank: null,
                directEntry: false,
                wildcardEntry: false,
                lockedOut: false,
                qualifiedEventId: null,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.inArray)(schema.seriesStandings.legId, legIds));
        });
    }
    async findUserByEmailOrPhone(emailOrPhone) {
        const [result] = await this.db
            .select({
            id: schema.users.id,
            email: schema.users.email,
        })
            .from(schema.users)
            .where((0, drizzle_orm_1.eq)(schema.users.email, emailOrPhone))
            .limit(1);
        return result || null;
    }
    async createInvitation(seriesId, email, phone, role) {
        const [record] = await this.db
            .insert(schema.seriesInvitations)
            .values({
            seriesId,
            email,
            phone,
            role,
            status: 'PENDING',
        })
            .returning();
        return record;
    }
    async findInvitations(seriesId) {
        return this.db
            .select()
            .from(schema.seriesInvitations)
            .where((0, drizzle_orm_1.eq)(schema.seriesInvitations.seriesId, seriesId))
            .orderBy((0, drizzle_orm_1.desc)(schema.seriesInvitations.createdAt));
    }
    async findInvitationById(id) {
        const [record] = await this.db
            .select()
            .from(schema.seriesInvitations)
            .where((0, drizzle_orm_1.eq)(schema.seriesInvitations.id, id))
            .limit(1);
        return record || null;
    }
    async updateInvitationStatus(id, status) {
        const [record] = await this.db
            .update(schema.seriesInvitations)
            .set({ status })
            .where((0, drizzle_orm_1.eq)(schema.seriesInvitations.id, id))
            .returning();
        return record;
    }
    async addManager(seriesId, userId, role) {
        const [record] = await this.db
            .insert(schema.seriesManagers)
            .values({
            seriesId,
            userId,
            role,
        })
            .returning();
        return record;
    }
    async removeManager(seriesId, userId) {
        const [record] = await this.db
            .delete(schema.seriesManagers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.seriesManagers.seriesId, seriesId), (0, drizzle_orm_1.eq)(schema.seriesManagers.userId, userId)))
            .returning();
        return record;
    }
    async findManagers(seriesId) {
        return this.db
            .select({
            manager: schema.seriesManagers,
            user: {
                id: schema.users.id,
                email: schema.users.email,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            }
        })
            .from(schema.seriesManagers)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.seriesManagers.userId, schema.users.id))
            .innerJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.seriesManagers.seriesId, seriesId))
            .orderBy((0, drizzle_orm_1.desc)(schema.seriesManagers.createdAt));
    }
};
exports.SeriesRepository = SeriesRepository;
exports.SeriesRepository = SeriesRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], SeriesRepository);
//# sourceMappingURL=series.repository.js.map