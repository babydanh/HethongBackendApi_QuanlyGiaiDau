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
exports.TournamentsRepository = void 0;
const common_1 = require("@nestjs/common");
const crypto = __importStar(require("crypto"));
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const enums_1 = require("../../common/constants/enums");
const drizzle_orm_1 = require("drizzle-orm");
const audit_service_1 = require("../audit/audit.service");
const series_service_1 = require("../series/series.service");
const exclusion_rule_exception_1 = require("../series/exceptions/exclusion-rule.exception");
const cursor_pagination_helper_1 = require("../../common/helpers/cursor-pagination.helper");
const bracket_advancement_helper_1 = require("../../common/helpers/bracket-advancement.helper");
const football_standings_1 = require("./utils/football-standings");
const football_roster_validation_1 = require("./utils/football-roster-validation");
const football_roster_lock_1 = require("./utils/football-roster-lock");
const football_team_config_1 = require("./utils/football-team-config");
let TournamentsRepository = class TournamentsRepository {
    db;
    auditService;
    seriesService;
    normalizeGender(value) {
        const normalized = value?.trim().toUpperCase();
        if (normalized === 'MALE' || normalized === 'NAM')
            return 'MALE';
        if (normalized === 'FEMALE' || normalized === 'NU' || normalized === 'NỮ')
            return 'FEMALE';
        return null;
    }
    constructor(db, auditService, seriesService) {
        this.db = db;
        this.auditService = auditService;
        this.seriesService = seriesService;
    }
    isDoublesMatchType(matchType) {
        return matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
    }
    getRequiredFootballMainRosterCount(config) {
        const resolved = (0, football_team_config_1.resolveFootballTeamConfig)(config);
        return resolved.isTeamSport ? resolved.mainSize : 1;
    }
    mergeRoundConfig(existing, incoming) {
        const previous = existing && typeof existing === 'object' && !Array.isArray(existing)
            ? existing
            : {};
        const next = incoming && typeof incoming === 'object' && !Array.isArray(incoming)
            ? incoming
            : {};
        const merged = { ...previous, ...next };
        for (const key of [
            'groupsConfig',
            'advancementConfig',
            'playoffConfig',
            'scoring',
            'tiebreakerRules',
            'rounds',
        ]) {
            const previousValue = previous[key];
            const nextValue = next[key];
            if (previousValue &&
                typeof previousValue === 'object' &&
                !Array.isArray(previousValue) &&
                nextValue &&
                typeof nextValue === 'object' &&
                !Array.isArray(nextValue)) {
                merged[key] = {
                    ...previousValue,
                    ...nextValue,
                };
            }
        }
        return merged;
    }
    async resolveDivisionEntryFee(tx, tournament, divisionId) {
        if (divisionId) {
            const [division] = await tx
                .select({ entryFee: schema.tournamentDivisions.entryFee })
                .from(schema.tournamentDivisions)
                .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, divisionId))
                .limit(1);
            if (division?.entryFee !== undefined && division.entryFee !== null) {
                return parseFloat(division.entryFee);
            }
        }
        return parseFloat(tournament.entryFee || '0');
    }
    async invalidatePendingParticipantPayments(tx, tournamentId, participantId, reason) {
        const pendingPayments = await tx
            .select({
            id: schema.payments.id,
            status: schema.payments.status,
        })
            .from(schema.payments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.payments.participantId, participantId), (0, drizzle_orm_1.eq)(schema.payments.status, enums_1.PaymentStatus.PENDING)));
        if (pendingPayments.length === 0) {
            return;
        }
        const paymentIds = pendingPayments.map((payment) => payment.id);
        await tx
            .update(schema.payments)
            .set({
            status: 'CANCELLED',
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.inArray)(schema.payments.id, paymentIds));
        await tx.insert(schema.paymentStatusLogs).values(pendingPayments.map((payment) => ({
            paymentId: payment.id,
            previousStatus: payment.status,
            newStatus: 'CANCELLED',
            reason,
        })));
    }
    async findAll(query, options) {
        const { page = 1, limit = 10, cursor, search, categoryId, status, tournamentType, matchType, communityId, visibility, region, createdBy, startDate, endDate, bracketType, genderRestriction, isRanked, } = query;
        const defaultTournamentType = options?.defaultTournamentType;
        const defaultVisibility = options?.defaultVisibility;
        const conditions = [];
        conditions.push((0, drizzle_orm_1.sql) `${schema.tournaments.deletedAt} IS NULL`);
        conditions.push((0, drizzle_orm_1.sql) `${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete')`);
        if (search) {
            const pattern = `%${search}%`;
            conditions.push((0, drizzle_orm_1.sql) `(${schema.tournaments.name}::text ILIKE ${pattern} OR ${schema.tournaments.description}::text ILIKE ${pattern} OR ${schema.tournaments.city}::text ILIKE ${pattern})`);
        }
        if (categoryId) {
            conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.categoryId, categoryId));
        }
        if (status) {
            conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.status, status));
        }
        if (communityId) {
            conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.communityId, communityId));
            const type = tournamentType || defaultTournamentType || 'CLUB';
            if (type) {
                conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.tournamentType, type));
            }
        }
        else {
            const type = tournamentType || defaultTournamentType;
            if (type) {
                conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.tournamentType, type));
            }
        }
        if (matchType || genderRestriction) {
            const matchConds = [];
            if (matchType) {
                matchConds.push((0, drizzle_orm_1.eq)(schema.tournaments.matchType, matchType));
            }
            if (genderRestriction) {
                matchConds.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournaments.genderRestriction, genderRestriction), (0, drizzle_orm_1.isNull)(schema.tournaments.genderRestriction)));
            }
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.and)(...matchConds), (0, drizzle_orm_1.sql) `exists (
            select 1 from ${schema.tournamentDivisions} d
            where d.tournament_id = ${schema.tournaments.id}
            ${matchType ? (0, drizzle_orm_1.sql) `and d.match_type = ${matchType}` : (0, drizzle_orm_1.sql) ``}
            ${genderRestriction ? (0, drizzle_orm_1.sql) `and (d.gender_restriction = ${genderRestriction} or d.gender_restriction is null)` : (0, drizzle_orm_1.sql) ``}
          )`));
        }
        if (bracketType) {
            conditions.push((0, drizzle_orm_1.sql) `${schema.tournaments.tournamentConfig}->>'bracketType' = ${bracketType}`);
        }
        if (isRanked !== undefined) {
            conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.isRanked, isRanked));
        }
        if (createdBy) {
            conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.createdBy, createdBy));
            if (visibility) {
                conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.visibility, visibility));
            }
        }
        else {
            const reqVisibility = visibility || defaultVisibility;
            if (reqVisibility) {
                conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.visibility, reqVisibility));
            }
        }
        if (region) {
            conditions.push((0, drizzle_orm_1.sql) `exists (
          select 1 from ${schema.tournamentVenues} v 
          where v.id = ${schema.tournaments.venueId} 
          and v.location_address ilike ${`%${region}%`}
        )`);
        }
        if (startDate) {
            conditions.push((0, drizzle_orm_1.sql) `date(${schema.tournaments.endDate}) >= ${startDate}::date`);
        }
        if (endDate) {
            conditions.push((0, drizzle_orm_1.sql) `date(coalesce(${schema.tournaments.registrationStartDate}, ${schema.tournaments.startDate})) <= ${endDate}::date`);
        }
        const baseWhereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const [decodedCursor] = cursor
            ? [
                cursor_pagination_helper_1.CursorPaginationHelper.decodeCursor(cursor),
            ]
            : [null];
        if (decodedCursor) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.lt)(schema.tournaments.createdAt, new Date(decodedCursor.createdAt)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.createdAt, new Date(decodedCursor.createdAt)), (0, drizzle_orm_1.lt)(schema.tournaments.id, decodedCursor.id))));
        }
        const whereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.tournaments)
            .where(baseWhereClause);
        const rows = this.db
            .select({
            tournament: schema.tournaments,
            category: {
                id: schema.categories.id,
                name: schema.categories.name,
                slug: schema.categories.slug,
            },
            venue: {
                id: schema.tournamentVenues.id,
                name: schema.tournamentVenues.name,
                locationAddress: schema.tournamentVenues.locationAddress,
            },
        })
            .from(schema.tournaments)
            .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.tournaments.categoryId, schema.categories.id))
            .leftJoin(schema.tournamentVenues, (0, drizzle_orm_1.eq)(schema.tournaments.venueId, schema.tournamentVenues.id))
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.sql) `${schema.tournaments.createdAt} DESC`, (0, drizzle_orm_1.sql) `${schema.tournaments.id} DESC`)
            .limit(limit + 1)
            .$dynamic();
        const resolvedRows = await rows;
        const hasMore = resolvedRows.length > limit;
        const rowData = hasMore ? resolvedRows.slice(0, limit) : resolvedRows;
        const data = await Promise.all(rowData.map(async (row) => {
            const [participantCount] = await this.db
                .select({ count: (0, drizzle_orm_1.count)() })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, row.tournament.id), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
            const rawDivs = await this.db
                .select({
                id: schema.tournamentDivisions.id,
                name: schema.tournamentDivisions.name,
                matchType: schema.tournamentDivisions.matchType,
                genderRestriction: schema.tournamentDivisions.genderRestriction,
                status: schema.tournamentDivisions.status,
                maxParticipants: schema.tournamentDivisions.maxParticipants,
            })
                .from(schema.tournamentDivisions)
                .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.tournamentId, row.tournament.id));
            const divisions = await Promise.all(rawDivs.map(async (d) => {
                const [dCount] = await this.db
                    .select({ count: (0, drizzle_orm_1.count)() })
                    .from(schema.tournamentParticipants)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, d.id), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
                return {
                    ...d,
                    categoryId: row.tournament.categoryId,
                    inviteCode: row.tournament.inviteCode,
                    _count: {
                        participants: dCount.count,
                    },
                };
            }));
            return {
                ...row.tournament,
                category: row.category?.id ? row.category : null,
                venue: row.venue?.id ? row.venue : null,
                _count: {
                    participants: participantCount.count,
                },
                divisions: divisions.length > 0 ? divisions : null,
            };
        }));
        return {
            data,
            meta: {
                total: totalRecord.count,
                page,
                limit,
                totalPages: Math.ceil(totalRecord.count / limit),
                nextCursor: hasMore && data.length > 0
                    ? cursor_pagination_helper_1.CursorPaginationHelper.encodeCursor({
                        id: data[data.length - 1].id,
                        createdAt: data[data.length - 1].createdAt,
                    })
                    : null,
                hasMore,
            },
        };
    }
    async generateUniqueInviteCode(tx) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        let exists = true;
        while (exists) {
            code = '';
            for (let i = 0; i < 8; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const existing = await tx
                .select({ id: schema.tournaments.id })
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.inviteCode, code))
                .limit(1);
            if (existing.length === 0) {
                exists = false;
            }
        }
        return code;
    }
    async findById(id) {
        const result = await this.db
            .select({
            tournament: schema.tournaments,
            category: {
                id: schema.categories.id,
                name: schema.categories.name,
                slug: schema.categories.slug,
            },
            community: {
                id: schema.communities.id,
                name: schema.communities.name,
                logoUrl: schema.communities.logoUrl,
            },
            venue: {
                id: schema.tournamentVenues.id,
                name: schema.tournamentVenues.name,
                locationAddress: schema.tournamentVenues.locationAddress,
            },
            creator: {
                id: schema.users.id,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            },
        })
            .from(schema.tournaments)
            .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.tournaments.categoryId, schema.categories.id))
            .leftJoin(schema.communities, (0, drizzle_orm_1.eq)(schema.tournaments.communityId, schema.communities.id))
            .leftJoin(schema.tournamentVenues, (0, drizzle_orm_1.eq)(schema.tournaments.venueId, schema.tournamentVenues.id))
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.tournaments.createdBy, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.id, id), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
            .limit(1);
        if (result.length === 0)
            return null;
        const row = result[0];
        const [participantCount] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, id), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
        let matchesTotal = 0;
        let matchesCompleted = 0;
        let matchesLive = 0;
        try {
            const [totalCount] = await this.db
                .select({ count: (0, drizzle_orm_1.count)() })
                .from(schema.matches)
                .innerJoin(schema.tournamentGroups, (0, drizzle_orm_1.eq)(schema.matches.groupId, schema.tournamentGroups.id))
                .innerJoin(schema.tournamentStages, (0, drizzle_orm_1.eq)(schema.tournamentGroups.stageId, schema.tournamentStages.id))
                .where((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, id));
            matchesTotal = totalCount.count;
            const [completedCount] = await this.db
                .select({ count: (0, drizzle_orm_1.count)() })
                .from(schema.matches)
                .innerJoin(schema.tournamentGroups, (0, drizzle_orm_1.eq)(schema.matches.groupId, schema.tournamentGroups.id))
                .innerJoin(schema.tournamentStages, (0, drizzle_orm_1.eq)(schema.tournamentGroups.stageId, schema.tournamentStages.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, id), (0, drizzle_orm_1.eq)(schema.matches.status, 'COMPLETED')));
            matchesCompleted = completedCount.count;
            const [liveCount] = await this.db
                .select({ count: (0, drizzle_orm_1.count)() })
                .from(schema.matches)
                .innerJoin(schema.tournamentGroups, (0, drizzle_orm_1.eq)(schema.matches.groupId, schema.tournamentGroups.id))
                .innerJoin(schema.tournamentStages, (0, drizzle_orm_1.eq)(schema.tournamentGroups.stageId, schema.tournamentStages.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, id), (0, drizzle_orm_1.eq)(schema.matches.status, 'ONGOING')));
            matchesLive = liveCount.count;
        }
        catch {
        }
        let isTrusted = false;
        if (row.tournament.createdBy) {
            const [resultCount] = await this.db
                .select({ count: (0, drizzle_orm_1.count)() })
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.createdBy, row.tournament.createdBy), (0, drizzle_orm_1.eq)(schema.tournaments.visibility, 'PUBLIC'), (0, drizzle_orm_1.eq)(schema.tournaments.status, 'COMPLETED'), (0, drizzle_orm_1.sql) `${schema.tournaments.deletedAt} IS NULL`));
            isTrusted = resultCount.count >= 3;
        }
        const parentId = row.tournament.parentId;
        let parent = null;
        let divisions = [];
        if (parentId) {
            const [parentRecord] = await this.db
                .select()
                .from(schema.parentTournaments)
                .where((0, drizzle_orm_1.eq)(schema.parentTournaments.id, parentId))
                .limit(1);
            parent = parentRecord || null;
        }
        const rawDivisions = await this.db
            .select({
            id: schema.tournamentDivisions.id,
            name: schema.tournamentDivisions.name,
            matchType: schema.tournamentDivisions.matchType,
            genderRestriction: schema.tournamentDivisions.genderRestriction,
            status: schema.tournamentDivisions.status,
            maxParticipants: schema.tournamentDivisions.maxParticipants,
        })
            .from(schema.tournamentDivisions)
            .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.tournamentId, id));
        divisions = await Promise.all(rawDivisions.map(async (division) => {
            const [participantCountByDivision] = await this.db
                .select({ count: (0, drizzle_orm_1.count)() })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, division.id), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
            const [matchCountByDivision] = await this.db
                .select({ count: (0, drizzle_orm_1.count)() })
                .from(schema.tournamentStages)
                .where((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, division.id));
            return {
                ...division,
                categoryId: row.tournament.categoryId,
                inviteCode: row.tournament.inviteCode,
                _count: {
                    participants: participantCountByDivision.count,
                    matches: matchCountByDivision.count,
                },
            };
        }));
        return {
            ...row.tournament,
            category: row.category?.id ? row.category : null,
            community: row.community?.id ? row.community : null,
            venue: row.venue?.id ? row.venue : null,
            creator: row.creator?.id ? row.creator : null,
            organizer: row.creator?.id
                ? {
                    id: row.creator.id,
                    fullName: row.creator.fullName,
                    avatarUrl: row.creator.avatarUrl,
                    isTrusted,
                }
                : null,
            _summary: {
                participantCount: participantCount.count,
                matchesTotal,
                matchesCompleted,
                matchesLive,
            },
            parent,
            divisions,
        };
    }
    async create(userId, data) {
        return await this.db.transaction(async (tx) => {
            const inviteCode = await this.generateUniqueInviteCode(tx);
            let configKey = 'PLATFORM_FEE_PERCENTAGE_CLUB';
            let defaultPct = '0';
            if (data.tournamentType === 'PUBLIC') {
                configKey = data.isRanked
                    ? 'PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED'
                    : 'PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED';
                defaultPct = '5';
            }
            const [configRecord] = await tx
                .select()
                .from(schema.systemConfigs)
                .where((0, drizzle_orm_1.eq)(schema.systemConfigs.key, configKey))
                .limit(1);
            const platformFeePercentage = data.platformFeePercentage !== undefined
                ? data.platformFeePercentage.toString()
                : configRecord
                    ? configRecord.value
                    : defaultPct;
            const [record] = await tx
                .insert(schema.tournaments)
                .values({
                createdBy: userId,
                name: data.name,
                categoryId: data.categoryId,
                communityId: data.communityId || null,
                description: data.description || null,
                matchType: data.matchType,
                sportRules: data.sportRules,
                tournamentConfig: data.tournamentConfig,
                entryFee: (data.entryFee || 0).toString(),
                platformFeePercentage,
                registrationStartDate: data.registrationStartDate
                    ? new Date(data.registrationStartDate)
                    : null,
                registrationEndDate: data.registrationEndDate
                    ? new Date(data.registrationEndDate)
                    : null,
                maxParticipants: data.maxParticipants || null,
                startDate: data.startDate ? new Date(data.startDate) : null,
                endDate: data.endDate ? new Date(data.endDate) : null,
                venueId: data.venueId || null,
                tournamentType: data.tournamentType || 'CLUB',
                bannerUrl: data.bannerUrl || null,
                logoUrl: data.logoUrl || null,
                galleryImages: data.galleryImages || [],
                prizeDescription: data.prizeDescription || null,
                prizes: data.prizes,
                inviteCode: inviteCode,
                contactInfo: data.contactInfo,
                status: 'DRAFT',
                visibility: data.visibility || 'PUBLIC',
                genderRestriction: data.genderRestriction || null,
                parentId: data.parentId || null,
                isRanked: data.isRanked !== undefined ? data.isRanked : true,
            })
                .returning();
            await this.auditService.logCreate(tx, userId, 'tournaments', record.id, record);
            return record;
        });
    }
    async update(id, userId, data) {
        const updatedResult = await this.db.transaction(async (tx) => {
            const [oldRecord] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, id))
                .limit(1);
            const [updated] = await tx
                .update(schema.tournaments)
                .set({
                ...(data.name && { name: data.name }),
                ...(data.categoryId && { categoryId: data.categoryId }),
                ...(data.communityId !== undefined && {
                    communityId: data.communityId,
                }),
                ...(data.description !== undefined && {
                    description: data.description,
                }),
                ...(data.status && { status: data.status }),
                ...(data.sportRules && { sportRules: data.sportRules }),
                ...(data.tournamentConfig && {
                    tournamentConfig: data.tournamentConfig,
                }),
                ...(data.entryFee !== undefined && {
                    entryFee: data.entryFee.toString(),
                }),
                ...(data.platformFeePercentage !== undefined && {
                    platformFeePercentage: data.platformFeePercentage.toString(),
                }),
                ...(data.registrationStartDate !== undefined && {
                    registrationStartDate: data.registrationStartDate
                        ? new Date(data.registrationStartDate)
                        : null,
                }),
                ...(data.registrationEndDate !== undefined && {
                    registrationEndDate: data.registrationEndDate
                        ? new Date(data.registrationEndDate)
                        : null,
                }),
                ...(data.maxParticipants !== undefined && {
                    maxParticipants: data.maxParticipants,
                }),
                ...(data.startDate && { startDate: new Date(data.startDate) }),
                ...(data.endDate && { endDate: new Date(data.endDate) }),
                ...(data.venueId !== undefined && { venueId: data.venueId }),
                ...(data.tournamentType && { tournamentType: data.tournamentType }),
                ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
                ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
                ...(data.galleryImages !== undefined && {
                    galleryImages: data.galleryImages,
                }),
                ...(data.prizeDescription !== undefined && {
                    prizeDescription: data.prizeDescription,
                }),
                ...(data.prizes !== undefined && { prizes: data.prizes }),
                ...(data.contactInfo !== undefined && {
                    contactInfo: data.contactInfo,
                }),
                ...(data.visibility !== undefined && { visibility: data.visibility }),
                ...(data.genderRestriction !== undefined && {
                    genderRestriction: data.genderRestriction,
                }),
                ...(data.parentId !== undefined && { parentId: data.parentId }),
                ...(data.isRegistrationLocked !== undefined && {
                    isRegistrationLocked: data.isRegistrationLocked,
                }),
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, id))
                .returning();
            if (data.status === 'COMPLETED' && oldRecord.status !== 'COMPLETED') {
                const participantsRoster = await tx
                    .select({ userId: schema.tournamentRosters.userId })
                    .from(schema.tournamentRosters)
                    .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
                    .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, id));
                const userIdsToLock = [
                    ...new Set(participantsRoster
                        .map((r) => r.userId)
                        .filter((uid) => !!uid)),
                ];
                if (userIdsToLock.length > 0) {
                    await tx
                        .update(schema.profiles)
                        .set({ isGenderLocked: true, updatedAt: new Date() })
                        .where((0, drizzle_orm_1.inArray)(schema.profiles.userId, userIdsToLock));
                }
            }
            if (data.status === 'REGISTRATION_CLOSED' &&
                oldRecord.status !== 'REGISTRATION_CLOSED') {
                const isPaidPublic = oldRecord.tournamentType === 'PUBLIC' &&
                    parseFloat(oldRecord.entryFee || '0') > 0;
                if (isPaidPublic) {
                    const [resultPayments] = await tx
                        .select({
                        total: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.payments.amount}), '0')`,
                    })
                        .from(schema.payments)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, id), (0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED')));
                    const totalCollected = parseFloat(resultPayments.total);
                    if (totalCollected > 0) {
                        const platformFeeRetained = totalCollected *
                            (parseFloat(oldRecord.platformFeePercentage || '0') / 100);
                        const amountRequested = totalCollected - platformFeeRetained;
                        if (amountRequested > 0) {
                            const [resultCount] = await tx
                                .select({ count: (0, drizzle_orm_1.count)() })
                                .from(schema.tournaments)
                                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.createdBy, oldRecord.createdBy), (0, drizzle_orm_1.eq)(schema.tournaments.visibility, 'PUBLIC'), (0, drizzle_orm_1.eq)(schema.tournaments.status, 'COMPLETED'), (0, drizzle_orm_1.sql) `${schema.tournaments.deletedAt} IS NULL`));
                            const isTrusted = resultCount.count >= 3;
                            const targetPayoutStatus = isTrusted
                                ? 'PENDING_DISBURSEMENT'
                                : 'HELD_IN_ESCROW';
                            const payoutTrigger = isTrusted
                                ? 'AUTO_ON_LOCK'
                                : 'MANUAL_ON_COMPLETE';
                            const [payoutRecord] = await tx
                                .insert(schema.organizerPayouts)
                                .values({
                                tournamentId: id,
                                organizerId: oldRecord.createdBy,
                                totalCollected: totalCollected.toString(),
                                amountRequested: amountRequested.toString(),
                                platformFeeRetained: platformFeeRetained.toString(),
                                bankName: 'PENDING',
                                bankAccountNumber: 'PENDING',
                                bankAccountName: 'PENDING',
                                status: targetPayoutStatus,
                                payoutTrigger,
                                holdUntil: isTrusted
                                    ? null
                                    : oldRecord.endDate
                                        ? new Date(oldRecord.endDate)
                                        : null,
                            })
                                .returning();
                            await tx.insert(schema.payoutStatusLogs).values({
                                payoutId: payoutRecord.id,
                                previousStatus: 'NONE',
                                newStatus: targetPayoutStatus,
                                changedBy: userId,
                                note: isTrusted
                                    ? 'AUTO_CREATED_TRUSTED_ORGANIZER'
                                    : 'AUTO_CREATED_ESCROW_HOLD',
                            });
                        }
                    }
                }
            }
            if (data.status === 'COMPLETED' && oldRecord.status !== 'COMPLETED') {
                const [escrowedPayout] = await tx
                    .select()
                    .from(schema.organizerPayouts)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.organizerPayouts.tournamentId, id), (0, drizzle_orm_1.eq)(schema.organizerPayouts.status, 'HELD_IN_ESCROW')))
                    .limit(1);
                if (escrowedPayout) {
                    await tx
                        .update(schema.organizerPayouts)
                        .set({
                        status: 'PENDING_DISBURSEMENT',
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema.organizerPayouts.id, escrowedPayout.id));
                    await tx.insert(schema.payoutStatusLogs).values({
                        payoutId: escrowedPayout.id,
                        previousStatus: 'HELD_IN_ESCROW',
                        newStatus: 'PENDING_DISBURSEMENT',
                        changedBy: userId,
                        note: 'AUTO_RELEASED_ON_TOURNAMENT_COMPLETE',
                    });
                }
            }
            await this.auditService.logUpdate(tx, userId, 'tournaments', id, oldRecord, updated);
            return updated;
        });
        if (data.status === 'COMPLETED') {
            try {
                await this.seriesService.computePsrForTournament(id);
            }
            catch (err) {
                console.error('Failed to compute PSR for tournament:', err);
            }
        }
        return updatedResult;
    }
    async softDelete(id, userId) {
        return await this.db.transaction(async (tx) => {
            const [oldRecord] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, id))
                .limit(1);
            const [deleted] = await tx
                .update(schema.tournaments)
                .set({ deletedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, id))
                .returning();
            await tx
                .update(schema.matches)
                .set({ deletedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, id), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)));
            await tx
                .delete(schema.notifications)
                .where((0, drizzle_orm_1.like)(schema.notifications.redirectUrl, `%/${id}%`));
            await this.auditService.logDelete(tx, userId, 'tournaments', id, oldRecord);
            return deleted;
        });
    }
    async archive(id, userId) {
        return this.db.transaction(async (tx) => {
            const [oldRecord] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.id, id), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
                .limit(1);
            if (!oldRecord)
                return null;
            const now = new Date();
            const [archived] = await tx
                .update(schema.tournaments)
                .set({ archivedAt: now, updatedAt: now })
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, id))
                .returning();
            await this.auditService.logUpdate(tx, userId, 'tournaments', id, oldRecord, archived);
            return archived;
        });
    }
    async countActiveParticipants(tournamentId) {
        const [result] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
        return result?.count || 0;
    }
    async countPaidPayments(tournamentId) {
        const [result] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.payments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED')));
        return result?.count || 0;
    }
    async countPendingRefunds(tournamentId) {
        const [result] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.paymentRefunds)
            .innerJoin(schema.payments, (0, drizzle_orm_1.eq)(schema.paymentRefunds.paymentId, schema.payments.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.paymentRefunds.status, 'REQUESTED')));
        return result?.count || 0;
    }
    async isFullyRefunded(tournamentId) {
        const [result] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.payments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED'), (0, drizzle_orm_1.sql) `${schema.payments.refundStatus} IS DISTINCT FROM 'REFUNDED'`));
        return (result?.count || 0) === 0;
    }
    async updateStatus(id, status) {
        return this.db
            .update(schema.tournaments)
            .set({ status, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, id))
            .returning();
    }
    async registerParticipant(tournamentId, userId, data, inviteCode) {
        return await this.db.transaction(async (tx) => {
            const [tournament] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .for('update')
                .limit(1);
            if (!tournament) {
                throw new common_1.BadRequestException('Giải đấu không tồn tại');
            }
            if (tournament.isRanked && data.rankingConsent !== true) {
                throw new common_1.BadRequestException('Giải đấu có xếp hạng yêu cầu bạn đồng ý gửi kết quả lên bảng xếp hạng.');
            }
            const [seriesEvent] = await tx
                .select({
                event: schema.seriesEvents,
                leg: schema.seriesLegs,
                series: schema.tournamentSeries,
            })
                .from(schema.seriesEvents)
                .innerJoin(schema.seriesLegs, (0, drizzle_orm_1.eq)(schema.seriesEvents.legId, schema.seriesLegs.id))
                .innerJoin(schema.tournamentSeries, (0, drizzle_orm_1.eq)(schema.seriesLegs.seriesId, schema.tournamentSeries.id))
                .where((0, drizzle_orm_1.eq)(schema.seriesEvents.tournamentId, tournamentId))
                .limit(1);
            if (seriesEvent && seriesEvent.series.rules) {
                const rules = seriesEvent.series.rules;
                if (rules.exclusionRule) {
                    const scope = rules.exclusionScope || 'CATEGORY';
                    const conds = [
                        (0, drizzle_orm_1.eq)(schema.seriesStandings.legId, seriesEvent.leg.id),
                        (0, drizzle_orm_1.eq)(schema.seriesStandings.userId, userId),
                        (0, drizzle_orm_1.eq)(schema.seriesStandings.lockedOut, true),
                    ];
                    if (scope === 'CATEGORY') {
                        conds.push((0, drizzle_orm_1.eq)(schema.seriesStandings.categoryId, tournament.categoryId));
                    }
                    const [standing] = await tx
                        .select()
                        .from(schema.seriesStandings)
                        .where((0, drizzle_orm_1.and)(...conds))
                        .limit(1);
                    if (standing) {
                        throw new exclusion_rule_exception_1.ExclusionRuleException(`Bạn đã giành Vé Thẳng trong chặng này và bị khóa không được đăng ký tiếp nội dung ${scope === 'CATEGORY' ? 'này' : 'thi đấu thuộc chặng'}.`);
                    }
                }
            }
            if (tournament.status !== 'REGISTRATION_OPEN' &&
                tournament.status !== 'UPCOMING') {
                throw new common_1.BadRequestException('Giải đấu chưa hoặc đã đóng đăng ký.');
            }
            const now = new Date();
            if (tournament.registrationStartDate &&
                now < tournament.registrationStartDate) {
                throw new common_1.BadRequestException('Thời gian đăng ký chưa bắt đầu.');
            }
            if (tournament.registrationEndDate &&
                now > tournament.registrationEndDate) {
                throw new common_1.BadRequestException('Thời gian đăng ký đã kết thúc.');
            }
            const tConfig = (tournament.tournamentConfig || {});
            const rawRegMode = tConfig.registrationMode || 'OPEN';
            const regMode = rawRegMode;
            if (regMode === 'INVITE_ONLY' || tournament.visibility === 'PRIVATE') {
                if (!inviteCode || tournament.inviteCode !== inviteCode) {
                    throw new common_1.BadRequestException('Mã mời giải đấu không hợp lệ hoặc thiếu.');
                }
            }
            const getProfileGender = async (targetUserId, label) => {
                const [profile] = await tx
                    .select({ gender: schema.profiles.gender })
                    .from(schema.profiles)
                    .where((0, drizzle_orm_1.eq)(schema.profiles.userId, targetUserId))
                    .limit(1);
                const rawGender = (profile?.gender || '').trim().toUpperCase();
                let gender = rawGender;
                if (rawGender === 'NAM' || rawGender === 'MALE')
                    gender = 'MALE';
                else if (rawGender === 'NỮ' ||
                    rawGender === 'NU' ||
                    rawGender === 'FEMALE')
                    gender = 'FEMALE';
                if (gender !== 'MALE' && gender !== 'FEMALE') {
                    throw new common_1.BadRequestException(`${label} cần cập nhật giới tính trong hồ sơ cá nhân để đăng ký.`);
                }
                return gender;
            };
            const normalizeMatchType = (matchType) => {
                if (matchType === 'SINGLES' ||
                    matchType === 'DOUBLES' ||
                    matchType === 'MIXED_DOUBLES') {
                    return matchType;
                }
                return 'DOUBLES';
            };
            const resolveMatchingDivision = async (partnerUserId) => {
                const divisions = await tx
                    .select()
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentDivisions.tournamentId, tournamentId), (0, drizzle_orm_1.ne)(schema.tournamentDivisions.status, 'CANCELLED')));
                if (divisions.length === 0)
                    return null;
                const requestedDivisionId = data.tournamentDivisionId ?? data.divisionId;
                const requestedDivision = requestedDivisionId
                    ? divisions.find((division) => division.id === requestedDivisionId)
                    : undefined;
                const requestedGenderRestriction = (requestedDivision?.genderRestriction || '').toUpperCase();
                const isExplicitOpenDivision = Boolean(requestedDivisionId &&
                    requestedDivision &&
                    !['MALE', 'FEMALE', 'MIXED'].includes(requestedGenderRestriction));
                const requiresLeaderGender = !isExplicitOpenDivision &&
                    (Boolean(partnerUserId) ||
                        !requestedDivisionId ||
                        (requestedGenderRestriction !== '' &&
                            requestedGenderRestriction !== 'OPEN'));
                const leaderGender = requiresLeaderGender
                    ? await getProfileGender(userId, 'Bạn')
                    : null;
                let targetMatchType = normalizeMatchType(tournament.matchType);
                let targetGenderRestriction = leaderGender === 'MALE' ? 'MALE' : 'FEMALE';
                if (partnerUserId && !isExplicitOpenDivision) {
                    const partnerGender = await getProfileGender(partnerUserId, 'Đồng đội');
                    targetGenderRestriction =
                        leaderGender === partnerGender ? leaderGender : 'MIXED';
                    targetMatchType =
                        targetGenderRestriction === 'MIXED' ? 'MIXED_DOUBLES' : 'DOUBLES';
                }
                else if (!partnerUserId &&
                    targetMatchType === 'MIXED_DOUBLES' &&
                    !requestedDivisionId) {
                    throw new common_1.BadRequestException('Hình thức Đôi Nam Nữ yêu cầu nhập đồng đội để xác định giới tính cặp.');
                }
                if (requestedDivisionId) {
                    if (requestedDivision) {
                        targetMatchType = normalizeMatchType(requestedDivision.matchType);
                        const reqGender = requestedGenderRestriction;
                        if (reqGender === 'MALE' ||
                            reqGender === 'FEMALE' ||
                            reqGender === 'MIXED') {
                            targetGenderRestriction = reqGender;
                        }
                    }
                }
                if (tournament.genderRestriction && !requestedDivisionId) {
                    const restriction = tournament.genderRestriction.toUpperCase();
                    if (restriction === 'MALE' && targetGenderRestriction !== 'MALE') {
                        throw new common_1.BadRequestException('Giải đấu chỉ dành cho Nam.');
                    }
                    if (restriction === 'FEMALE' &&
                        targetGenderRestriction !== 'FEMALE') {
                        throw new common_1.BadRequestException('Giải đấu chỉ dành cho Nữ.');
                    }
                    if (restriction === 'MIXED' && targetGenderRestriction !== 'MIXED') {
                        throw new common_1.BadRequestException('Giải đấu Mixed Doubles yêu cầu 1 Nam và 1 Nữ.');
                    }
                }
                const selectedDivision = requestedDivisionId
                    ? divisions.find((division) => division.id === requestedDivisionId)
                    : divisions.find((division) => division.matchType === targetMatchType &&
                        (division.genderRestriction === targetGenderRestriction ||
                            !division.genderRestriction ||
                            division.genderRestriction.toUpperCase() === 'OPEN'));
                if (!selectedDivision) {
                    const fallbackLabel = targetGenderRestriction === 'MIXED'
                        ? 'Đôi Nam Nữ'
                        : targetMatchType === 'SINGLES'
                            ? targetGenderRestriction === 'MALE'
                                ? 'Đơn Nam'
                                : 'Đơn Nữ'
                            : targetGenderRestriction === 'MALE'
                                ? 'Đôi Nam'
                                : 'Đôi Nữ';
                    throw new common_1.BadRequestException(`Không có hình thức thi đấu ${fallbackLabel} phù hợp cho giải này.`);
                }
                const divGender = (selectedDivision.genderRestriction || '').toUpperCase();
                if (divGender === 'MALE' && leaderGender && leaderGender !== 'MALE') {
                    throw new common_1.BadRequestException('Hình thức thi đấu đã chọn chỉ dành cho VĐV Nam.');
                }
                if (divGender === 'FEMALE' &&
                    leaderGender &&
                    leaderGender !== 'FEMALE') {
                    throw new common_1.BadRequestException('Hình thức thi đấu đã chọn chỉ dành cho VĐV Nữ.');
                }
                if (selectedDivision.maxParticipants) {
                    const [participantCount] = await tx
                        .select({ count: (0, drizzle_orm_1.count)() })
                        .from(schema.tournamentParticipants)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, selectedDivision.id), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isPaid, true)));
                    if (participantCount.count >= selectedDivision.maxParticipants) {
                        return { division: selectedDivision, isWaitlisted: true };
                    }
                }
                return { division: selectedDivision, isWaitlisted: false };
            };
            if (tournament.maxParticipants) {
                const [lockedTournament] = await tx
                    .select()
                    .from(schema.tournaments)
                    .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                    .for('update');
                if (!lockedTournament)
                    throw new common_1.BadRequestException('Giải đấu không tồn tại.');
                const tCfg = (lockedTournament.tournamentConfig || {});
                if (tCfg.isLite === true) {
                    const isDoubles = lockedTournament.matchType === 'DOUBLES' ||
                        lockedTournament.matchType === 'MIXED_DOUBLES';
                    const maxSlots = isDoubles
                        ? lockedTournament.maxParticipants * 2
                        : lockedTournament.maxParticipants;
                    const [{ count: activeRosterUsers }] = await tx
                        .select({
                        count: (0, drizzle_orm_1.sql) `count(distinct ${schema.tournamentRosters.userId})`,
                    })
                        .from(schema.tournamentRosters)
                        .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
                    if (Number(activeRosterUsers) >= maxSlots) {
                        throw new common_1.BadRequestException('Giải đấu đã đủ số lượng người tham gia.');
                    }
                }
                else {
                    const [participantCount] = await tx
                        .select({ count: (0, drizzle_orm_1.count)() })
                        .from(schema.tournamentParticipants)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isPaid, true)));
                    if (participantCount.count >= tournament.maxParticipants) {
                        throw new common_1.BadRequestException('Giải đấu đã đầy.');
                    }
                }
            }
            if (tournament.tournamentType === 'CLUB' && tournament.communityId) {
                const member = await tx
                    .select()
                    .from(schema.communityMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, tournament.communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED')))
                    .limit(1);
                if (member.length === 0) {
                    throw new common_1.BadRequestException('Chỉ thành viên CLB mới được đăng ký giải đấu này.');
                }
            }
            const existingRosters = await tx
                .select({ userId: schema.tournamentRosters.userId })
                .from(schema.tournamentRosters)
                .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'EXPIRED')));
            if (existingRosters.length > 0) {
                throw new common_1.BadRequestException('Bạn đã đăng ký tham gia giải đấu này rồi.');
            }
            const tournamentIsDoubles = this.isDoublesMatchType(tournament.matchType);
            let partnerId = null;
            if (tournamentIsDoubles && data.partnerEmailOrPhone) {
                const [partnerUser] = await tx
                    .select({ id: schema.users.id })
                    .from(schema.users)
                    .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
                    .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.users.email, data.partnerEmailOrPhone), (0, drizzle_orm_1.eq)(schema.profiles.phoneNumber, data.partnerEmailOrPhone)))
                    .limit(1);
                if (!partnerUser) {
                    throw new common_1.BadRequestException('Không tìm thấy tài khoản Sporto của đồng đội. Vui lòng kiểm tra lại Email hoặc SĐT.');
                }
                if (partnerUser.id === userId) {
                    throw new common_1.BadRequestException('Email/SĐT của đồng đội không được trùng với tài khoản của bạn.');
                }
                const partnerExisting = await tx
                    .select({ userId: schema.tournamentRosters.userId })
                    .from(schema.tournamentRosters)
                    .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, partnerUser.id), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'EXPIRED')));
                if (partnerExisting.length > 0) {
                    throw new common_1.BadRequestException('Đồng đội của bạn đã đăng ký tham gia giải đấu này rồi.');
                }
                if (tournament.genderRestriction &&
                    !(data.tournamentDivisionId ?? data.divisionId)) {
                    const [partnerProfile] = await tx
                        .select({ gender: schema.profiles.gender })
                        .from(schema.profiles)
                        .where((0, drizzle_orm_1.eq)(schema.profiles.userId, partnerUser.id))
                        .limit(1);
                    if (!partnerProfile || !partnerProfile.gender) {
                        throw new common_1.BadRequestException('Đồng đội chưa cập nhật giới tính trong hồ sơ cá nhân.');
                    }
                    const leaderProfileRes = await tx
                        .select({ gender: schema.profiles.gender })
                        .from(schema.profiles)
                        .where((0, drizzle_orm_1.eq)(schema.profiles.userId, userId))
                        .limit(1);
                    const rawLeaderG = (leaderProfileRes[0]?.gender || '')
                        .trim()
                        .toUpperCase();
                    const leaderGenderVal = rawLeaderG === 'NAM' || rawLeaderG === 'MALE'
                        ? 'MALE'
                        : rawLeaderG === 'NỮ' ||
                            rawLeaderG === 'NU' ||
                            rawLeaderG === 'FEMALE'
                            ? 'FEMALE'
                            : rawLeaderG;
                    const rawPartnerG = (partnerProfile.gender || '')
                        .trim()
                        .toUpperCase();
                    const partnerGenderVal = rawPartnerG === 'NAM' || rawPartnerG === 'MALE'
                        ? 'MALE'
                        : rawPartnerG === 'NỮ' ||
                            rawPartnerG === 'NU' ||
                            rawPartnerG === 'FEMALE'
                            ? 'FEMALE'
                            : rawPartnerG;
                    const restriction = tournament.genderRestriction.toUpperCase();
                    if (restriction === 'MALE' && partnerGenderVal !== 'MALE') {
                        throw new common_1.BadRequestException('Giải đấu chỉ dành cho Nam (cả 2 VĐV phải là Nam).');
                    }
                    if (restriction === 'FEMALE' && partnerGenderVal !== 'FEMALE') {
                        throw new common_1.BadRequestException('Giải đấu chỉ dành cho Nữ (cả 2 VĐV phải là Nữ).');
                    }
                    if (restriction === 'MIXED') {
                        if (!leaderGenderVal) {
                            throw new common_1.BadRequestException('Bạn cần cập nhật giới tính trong hồ sơ để xác nhận Mixed Doubles.');
                        }
                        if (leaderGenderVal === partnerGenderVal) {
                            throw new common_1.BadRequestException('Giải đấu Mixed Doubles yêu cầu 1 Nam và 1 Nữ.');
                        }
                    }
                }
                partnerId = partnerUser.id;
            }
            const resolvedDivision = await resolveMatchingDivision(partnerId);
            const selectedDivision = resolvedDivision?.division ?? null;
            const isWaitlisted = resolvedDivision?.isWaitlisted === true;
            const effectiveMatchType = selectedDivision?.matchType ?? tournament.matchType;
            const isDoubles = this.isDoublesMatchType(effectiveMatchType);
            const tConfigForTeam = (tournament.tournamentConfig || {});
            const isTeamSport = (0, football_team_config_1.resolveFootballTeamConfig)(tConfigForTeam).isTeamSport;
            const payableEntryFeeAmount = parseFloat(selectedDivision?.entryFee ?? tournament.entryFee ?? '0');
            const registrationDeadlines = [
                selectedDivision?.registrationEndDate,
                tournament.registrationEndDate,
            ]
                .filter(Boolean)
                .map((value) => new Date(value));
            const registrationDeadline = registrationDeadlines.sort((a, b) => a.getTime() - b.getTime())[0];
            if (registrationDeadline && now >= registrationDeadline) {
                throw new common_1.BadRequestException('Hạn đăng ký của nội dung thi đấu này đã kết thúc.');
            }
            const teamInviteToken = isDoubles || (isTeamSport && !data.footballTeamId)
                ? crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase()
                : null;
            const inviteBaseExpiresAt = new Date(now.getTime() + 60 * 60 * 1000);
            const partnerInviteExpiresAt = isDoubles
                ? registrationDeadline
                    ? new Date(Math.min(inviteBaseExpiresAt.getTime(), registrationDeadline.getTime()))
                    : inviteBaseExpiresAt
                : null;
            const teamStatus = isWaitlisted
                ? 'WAITLISTED'
                : isDoubles
                    ? 'PENDING_PARTNER'
                    : regMode === 'APPROVAL'
                        ? 'PENDING_APPROVAL'
                        : 'COMPLETE';
            const isPaid = payableEntryFeeAmount === 0;
            const registrationForm = (tConfigForTeam.registrationForm || null);
            const formApplies = Boolean(registrationForm?.status === 'PUBLISHED' &&
                selectedDivision &&
                (!Array.isArray(registrationForm.divisionIds) || registrationForm.divisionIds.length === 0 || registrationForm.divisionIds.includes(selectedDivision.id)));
            if (formApplies && registrationForm?.fields && typeof registrationForm.fields === 'object' && Array.isArray(registrationForm.fields)) {
                const responses = data.customResponses ?? {};
                for (const rawField of registrationForm.fields) {
                    if (!rawField || typeof rawField !== 'object' || Array.isArray(rawField))
                        continue;
                    const field = rawField;
                    const fieldId = typeof field.id === 'string' ? field.id : '';
                    const value = fieldId ? responses[fieldId] : undefined;
                    const isEmpty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
                    if (field.required === true && isEmpty) {
                        throw new common_1.BadRequestException(`Vui lòng điền trường “${typeof field.label === 'string' ? field.label : fieldId}”.`);
                    }
                    if (isEmpty)
                        continue;
                    if (field.type === 'EMAIL' && (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) {
                        throw new common_1.BadRequestException(`Trường “${String(field.label || fieldId)}” phải là email hợp lệ.`);
                    }
                    if (field.type === 'NUMBER') {
                        const numberValue = typeof value === 'number' ? value : Number(value);
                        if (!Number.isFinite(numberValue))
                            throw new common_1.BadRequestException(`Trường “${String(field.label || fieldId)}” phải là số.`);
                        if (typeof field.min === 'number' && numberValue < field.min)
                            throw new common_1.BadRequestException(`Trường “${String(field.label || fieldId)}” không được nhỏ hơn ${field.min}.`);
                        if (typeof field.max === 'number' && numberValue > field.max)
                            throw new common_1.BadRequestException(`Trường “${String(field.label || fieldId)}” không được lớn hơn ${field.max}.`);
                    }
                    if (field.type === 'SELECT' && Array.isArray(field.options) && !field.options.includes(value)) {
                        throw new common_1.BadRequestException(`Lựa chọn của trường “${String(field.label || fieldId)}” không hợp lệ.`);
                    }
                    if (field.type === 'CHECKBOX' && value !== true) {
                        throw new common_1.BadRequestException(`Bạn cần xác nhận “${String(field.label || fieldId)}”.`);
                    }
                }
            }
            let finalTeamName = (data.teamName || '').trim();
            let footballTeamMemberIds = [];
            let footballTeamReserveMemberIds = [];
            let footballTeamLogoUrl = null;
            if (isTeamSport && data.footballTeamId) {
                const [footballTeam] = await tx
                    .select({
                    id: schema.footballTeams.id,
                    name: schema.footballTeams.name,
                    categoryId: schema.footballTeams.categoryId,
                    logoUrl: schema.footballTeams.logoUrl,
                    status: schema.footballTeams.status,
                })
                    .from(schema.footballTeams)
                    .where((0, drizzle_orm_1.eq)(schema.footballTeams.id, data.footballTeamId))
                    .limit(1);
                if (!footballTeam ||
                    footballTeam.status !== 'ACTIVE' ||
                    footballTeam.categoryId !== tournament.categoryId) {
                    throw new common_1.BadRequestException('Đội bóng không hợp lệ cho giải đấu này.');
                }
                const [leaderMembership] = await tx
                    .select({ role: schema.footballTeamMembers.role })
                    .from(schema.footballTeamMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, data.footballTeamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE')))
                    .limit(1);
                if (!leaderMembership ||
                    !['CAPTAIN', 'MANAGER'].includes(leaderMembership.role)) {
                    throw new common_1.ForbiddenException('Chỉ đội trưởng hoặc quản lý mới được đăng ký đội bóng.');
                }
                const footballMembers = await tx
                    .select({ userId: schema.footballTeamMembers.userId })
                    .from(schema.footballTeamMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, data.footballTeamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE')));
                const teamConfig = (tournament.tournamentConfig || {});
                const resolvedTeamConfig = (0, football_team_config_1.resolveFootballTeamConfig)(teamConfig);
                const configuredTeamSize = resolvedTeamConfig.mainSize;
                const configuredMaxTeamSize = resolvedTeamConfig.maxTotalSize;
                const configuredMaxReserve = resolvedTeamConfig.maxReserve;
                const activeMemberIds = new Set(footballMembers.map((member) => member.userId));
                const roster = (0, football_roster_validation_1.validateFootballRosterSelection)({
                    leaderId: userId,
                    memberIds: Array.isArray(data.memberIds) && data.memberIds.length > 0
                        ? data.memberIds
                        : footballMembers.map((member) => member.userId),
                    reserveMemberIds: Array.isArray(data.reserveMemberIds)
                        ? data.reserveMemberIds
                        : [],
                    activeMemberIds,
                    minMainSize: 1,
                    maxMainSize: configuredTeamSize,
                    maxReserve: configuredMaxReserve,
                    maxTotalSize: configuredMaxTeamSize,
                });
                footballTeamMemberIds = roster.mainMemberIds;
                footballTeamReserveMemberIds = roster.reserveMemberIds;
                finalTeamName = footballTeam.name;
                footballTeamLogoUrl = footballTeam.logoUrl ?? null;
            }
            if (isTeamSport && data.footballTeamId && selectedDivision) {
                const divisionGender = (selectedDivision.genderRestriction || '')
                    .trim()
                    .toUpperCase();
                if (divisionGender === 'MALE' || divisionGender === 'FEMALE') {
                    const rosterIds = [
                        ...footballTeamMemberIds,
                        ...footballTeamReserveMemberIds,
                    ];
                    const rosterProfiles = rosterIds.length > 0
                        ? await tx
                            .select({
                            userId: schema.profiles.userId,
                            gender: schema.profiles.gender,
                        })
                            .from(schema.profiles)
                            .where((0, drizzle_orm_1.inArray)(schema.profiles.userId, rosterIds))
                        : [];
                    const profileGender = new Map(rosterProfiles.map((profile) => [
                        profile.userId,
                        (profile.gender || '').trim().toUpperCase(),
                    ]));
                    for (const rosterId of rosterIds) {
                        const rawGender = profileGender.get(rosterId);
                        const normalizedGender = rawGender === 'NAM' || rawGender === 'MALE'
                            ? 'MALE'
                            : rawGender === 'NỮ' ||
                                rawGender === 'NU' ||
                                rawGender === 'FEMALE'
                                ? 'FEMALE'
                                : null;
                        if (!normalizedGender) {
                            throw new common_1.BadRequestException('Mọi thành viên đội bóng phải cập nhật giới tính trước khi đăng ký division này.');
                        }
                        if (normalizedGender !== divisionGender) {
                            throw new common_1.BadRequestException(divisionGender === 'MALE'
                                ? 'Division này chỉ dành cho Nam.'
                                : 'Division này chỉ dành cho Nữ.');
                        }
                    }
                }
            }
            if (isTeamSport && data.footballTeamId) {
                const selectedFootballMemberIds = [
                    ...new Set([
                        ...footballTeamMemberIds,
                        ...footballTeamReserveMemberIds,
                    ]),
                ];
                if (selectedFootballMemberIds.length > 0) {
                    const existingFootballRoster = await tx
                        .select({
                        userId: schema.tournamentRosters.userId,
                        divisionId: schema.tournamentParticipants.tournamentDivisionId,
                    })
                        .from(schema.tournamentRosters)
                        .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.inArray)(schema.tournamentRosters.userId, selectedFootballMemberIds), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'EXPIRED')));
                    if (existingFootballRoster.length > 0) {
                        throw new common_1.BadRequestException('Một hoặc nhiều thành viên đội bóng đã đăng ký nội dung khác trong giải đấu này.');
                    }
                }
            }
            if (!finalTeamName) {
                const [leaderProfile] = await tx
                    .select({ fullName: schema.profiles.fullName })
                    .from(schema.profiles)
                    .where((0, drizzle_orm_1.eq)(schema.profiles.userId, userId))
                    .limit(1);
                finalTeamName = leaderProfile?.fullName || 'Vận động viên';
            }
            const [participant] = await tx
                .insert(schema.tournamentParticipants)
                .values({
                tournamentId,
                tournamentDivisionId: selectedDivision?.id ?? null,
                registeredBy: userId,
                teamName: finalTeamName,
                footballTeamId: isTeamSport ? (data.footballTeamId ?? null) : null,
                footballTeamLogoUrl: isTeamSport ? footballTeamLogoUrl : null,
                rankingConsent: data.rankingConsent === true,
                customResponses: data.customResponses ?? null,
                isPaid,
                teamInviteToken,
                teamStatus,
                partnerUserId: isDoubles ? partnerId : null,
                partnerInviteExpiresAt,
            })
                .returning();
            await tx.insert(schema.tournamentRosters).values({
                participantId: participant.id,
                userId: userId,
                role: 'MAIN',
            });
            if (isTeamSport) {
                const requestedMemberIds = footballTeamMemberIds.length > 0
                    ? footballTeamMemberIds
                    : Array.isArray(data.memberIds)
                        ? data.memberIds
                        : [];
                const uniqueMemberIds = [
                    ...new Set(requestedMemberIds.filter((mid) => mid !== userId)),
                ];
                for (const mid of uniqueMemberIds) {
                    const [existing] = await tx
                        .select()
                        .from(schema.tournamentRosters)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participant.id), (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, mid)))
                        .limit(1);
                    if (existing)
                        continue;
                    await tx.insert(schema.tournamentRosters).values({
                        participantId: participant.id,
                        userId: mid,
                        role: 'MAIN',
                    });
                }
                for (const reserveId of [...new Set(footballTeamReserveMemberIds)]) {
                    if (reserveId === userId || uniqueMemberIds.includes(reserveId))
                        continue;
                    await tx.insert(schema.tournamentRosters).values({
                        participantId: participant.id,
                        userId: reserveId,
                        role: 'RESERVE',
                    });
                }
            }
            if (isTeamSport && data.footballTeamId && selectedDivision?.id) {
                const snapshotMainMemberIds = [
                    ...new Set((footballTeamMemberIds.length > 0
                        ? footballTeamMemberIds
                        : [userId]).filter((memberId) => memberId.trim().length > 0)),
                ];
                const snapshotReserveMemberIds = [
                    ...new Set(footballTeamReserveMemberIds.filter((memberId) => memberId.trim().length > 0)),
                ];
                const snapshotMemberIds = [
                    ...snapshotMainMemberIds,
                    ...snapshotReserveMemberIds,
                ];
                const captainRows = await tx
                    .select({ userId: schema.footballTeamMembers.userId })
                    .from(schema.footballTeamMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, data.footballTeamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.role, 'CAPTAIN'), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.role, 'MANAGER'))));
                const captainIdsSnapshot = captainRows.map((row) => row.userId);
                const requiredMainRosterCount = this.getRequiredFootballMainRosterCount(tournament.tournamentConfig);
                const hasPendingConfirmation = snapshotMemberIds.some((memberId) => memberId !== userId);
                const hasUndersizedMainRoster = snapshotMainMemberIds.length < requiredMainRosterCount;
                const [entry] = await tx
                    .insert(schema.tournamentTeamEntries)
                    .values({
                    tournamentId,
                    divisionId: selectedDivision.id,
                    teamId: data.footballTeamId,
                    status: hasUndersizedMainRoster
                        ? 'DRAFT'
                        : hasPendingConfirmation
                            ? 'PENDING_CONFIRMATION'
                            : 'CONFIRMED',
                    displayNameSnapshot: finalTeamName,
                    logoUrlSnapshot: footballTeamLogoUrl,
                    captainIdsSnapshot,
                    createdBy: userId,
                    confirmedAt: hasPendingConfirmation ? null : new Date(),
                })
                    .returning({ id: schema.tournamentTeamEntries.id });
                if (entry) {
                    await tx.insert(schema.tournamentTeamRosterSnapshots).values(snapshotMemberIds.map((memberId) => ({
                        entryId: entry.id,
                        userId: memberId,
                        role: snapshotMainMemberIds.includes(memberId)
                            ? 'MAIN'
                            : 'RESERVE',
                        confirmationStatus: memberId === userId ? 'CONFIRMED' : 'PENDING',
                    })));
                }
            }
            const paymentUrl = null;
            await this.auditService.logCreate(tx, userId, 'tournament_participants', participant.id, participant);
            return {
                participant,
                entryFee: payableEntryFeeAmount,
                paymentUrl,
                teamInviteLink: isDoubles || (isTeamSport && !data.footballTeamId)
                    ? `/tournaments/${tournamentId}/join-team?pid=${participant.id}&token=${teamInviteToken}`
                    : null,
                isWaitlisted,
            };
        });
    }
    async acceptPartnerInvite(participantId, partnerUserId) {
        return await this.db.transaction(async (tx) => {
            const [participant] = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .for('update')
                .limit(1);
            if (!participant) {
                throw new common_1.NotFoundException('Lời mời ghép đôi không tồn tại hoặc đã bị hủy.');
            }
            if (!participant.partnerInviteExpiresAt ||
                new Date() >= participant.partnerInviteExpiresAt) {
                await tx
                    .update(schema.tournamentParticipants)
                    .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
                    .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId));
                throw new common_1.BadRequestException('Lời mời ghép đôi đã hết hạn. Suất giữ chỗ đã được giải phóng.');
            }
            if (participant.teamStatus !== 'PENDING_PARTNER') {
                throw new common_1.BadRequestException('Lời mời ghép đôi này đã được xử lý hoặc đã kết thúc.');
            }
            if (participant.partnerUserId !== partnerUserId) {
                throw new common_1.BadRequestException('Chỉ đúng tài khoản đồng đội được mời mới có thể xác nhận lời mời này.');
            }
            const [tournament] = await tx
                .select({
                tournamentConfig: schema.tournaments.tournamentConfig,
                registrationEndDate: schema.tournaments.registrationEndDate,
            })
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, participant.tournamentId))
                .limit(1);
            const [division] = participant.tournamentDivisionId
                ? await tx
                    .select({
                    registrationEndDate: schema.tournamentDivisions.registrationEndDate,
                    matchType: schema.tournamentDivisions.matchType,
                    genderRestriction: schema.tournamentDivisions.genderRestriction,
                })
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, participant.tournamentDivisionId))
                    .limit(1)
                : [null];
            const registrationDeadlines = [
                tournament?.registrationEndDate,
                division?.registrationEndDate,
            ]
                .filter(Boolean)
                .map((value) => new Date(value));
            const registrationDeadline = registrationDeadlines.sort((a, b) => a.getTime() - b.getTime())[0];
            if (registrationDeadline && new Date() >= registrationDeadline) {
                await tx
                    .update(schema.tournamentParticipants)
                    .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
                    .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId));
                throw new common_1.BadRequestException('Giải đấu đã đóng đăng ký. Lời mời ghép đôi không thể xác nhận thêm.');
            }
            const [leaderRoster] = await tx
                .select({ userId: schema.tournamentRosters.userId })
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId))
                .limit(1);
            const [leaderProfile] = leaderRoster
                ? await tx
                    .select({ gender: schema.profiles.gender })
                    .from(schema.profiles)
                    .where((0, drizzle_orm_1.eq)(schema.profiles.userId, leaderRoster.userId))
                    .limit(1)
                : [null];
            const [partnerProfile] = await tx
                .select({ gender: schema.profiles.gender })
                .from(schema.profiles)
                .where((0, drizzle_orm_1.eq)(schema.profiles.userId, partnerUserId))
                .limit(1);
            const leaderGender = this.normalizeGender(leaderProfile?.gender);
            const partnerGender = this.normalizeGender(partnerProfile?.gender);
            if (!leaderGender || !partnerGender) {
                throw new common_1.BadRequestException('Cáº£ hai VÄV cáº§n cáº­p nháº­t giá»›i tÃ­nh trong há»“ sÆ¡ Ä‘á»ƒ tham gia.');
            }
            const targetGender = leaderGender === partnerGender ? leaderGender : 'MIXED';
            const targetMatchType = targetGender === 'MIXED' ? 'MIXED_DOUBLES' : 'DOUBLES';
            const divisionGender = this.normalizeGender(division?.genderRestriction) ??
                (division?.genderRestriction || '').toUpperCase();
            if (division &&
                (division.matchType !== targetMatchType ||
                    (divisionGender &&
                        divisionGender !== 'OPEN' &&
                        divisionGender !== targetGender))) {
                throw new common_1.BadRequestException('Äá»“ng Ä‘á»™i khÃ´ng phÃ¹ há»£p vá»›i hÃ¬nh thá»©c thi Ä‘áº¥u Ä‘Ã£ Ä‘Äƒng kÃ½.');
            }
            const existingRosters = await tx
                .select()
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId), (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, partnerUserId)));
            if (existingRosters.length === 0) {
                await tx.insert(schema.tournamentRosters).values({
                    participantId,
                    userId: partnerUserId,
                    role: 'MAIN',
                });
            }
            const partnerConfig = (tournament?.tournamentConfig || {});
            const targetStatus = partnerConfig.isLite === true
                ? 'COMPLETE'
                : partnerConfig.registrationMode === 'APPROVAL'
                    ? 'PENDING_APPROVAL'
                    : 'COMPLETE';
            const [updated] = await tx
                .update(schema.tournamentParticipants)
                .set({
                teamStatus: targetStatus,
                partnerInviteExpiresAt: null,
            })
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .returning();
            return updated;
        });
    }
    async rejectPartnerInvite(participantId, partnerUserId) {
        return await this.db.transaction(async (tx) => {
            const [participant] = await tx
                .select({
                id: schema.tournamentParticipants.id,
                partnerUserId: schema.tournamentParticipants.partnerUserId,
                teamStatus: schema.tournamentParticipants.teamStatus,
                partnerInviteExpiresAt: schema.tournamentParticipants.partnerInviteExpiresAt,
            })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .for('update')
                .limit(1);
            if (!participant) {
                throw new common_1.NotFoundException('Lời mời ghép đôi không tồn tại hoặc đã bị hủy.');
            }
            if (participant.partnerUserId !== partnerUserId) {
                throw new common_1.BadRequestException('Chỉ đúng tài khoản đồng đội được mời mới có thể từ chối lời mời này.');
            }
            if (!participant.partnerInviteExpiresAt ||
                new Date() >= participant.partnerInviteExpiresAt) {
                await tx
                    .update(schema.tournamentParticipants)
                    .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
                    .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId));
                throw new common_1.BadRequestException('Lời mời ghép đôi đã hết hạn.');
            }
            if (participant.teamStatus !== 'PENDING_PARTNER') {
                throw new common_1.BadRequestException('Lời mời ghép đôi này đã được xử lý hoặc đã kết thúc.');
            }
            const [updated] = await tx
                .update(schema.tournamentParticipants)
                .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .returning();
            return updated;
        });
    }
    async joinTeam(tournamentId, userId, participantId, teamInviteToken) {
        return await this.db.transaction(async (tx) => {
            const [tournament] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .limit(1);
            if (!tournament)
                throw new common_1.NotFoundException('Giải đấu không tồn tại');
            const [seriesEvent] = await tx
                .select({
                event: schema.seriesEvents,
                leg: schema.seriesLegs,
                series: schema.tournamentSeries,
            })
                .from(schema.seriesEvents)
                .innerJoin(schema.seriesLegs, (0, drizzle_orm_1.eq)(schema.seriesEvents.legId, schema.seriesLegs.id))
                .innerJoin(schema.tournamentSeries, (0, drizzle_orm_1.eq)(schema.seriesLegs.seriesId, schema.tournamentSeries.id))
                .where((0, drizzle_orm_1.eq)(schema.seriesEvents.tournamentId, tournamentId))
                .limit(1);
            if (seriesEvent && seriesEvent.series.rules) {
                const rules = seriesEvent.series.rules;
                if (rules.exclusionRule) {
                    const scope = rules.exclusionScope || 'CATEGORY';
                    const conds = [
                        (0, drizzle_orm_1.eq)(schema.seriesStandings.legId, seriesEvent.leg.id),
                        (0, drizzle_orm_1.eq)(schema.seriesStandings.userId, userId),
                        (0, drizzle_orm_1.eq)(schema.seriesStandings.lockedOut, true),
                    ];
                    if (scope === 'CATEGORY') {
                        conds.push((0, drizzle_orm_1.eq)(schema.seriesStandings.categoryId, tournament.categoryId));
                    }
                    const [standing] = await tx
                        .select()
                        .from(schema.seriesStandings)
                        .where((0, drizzle_orm_1.and)(...conds))
                        .limit(1);
                    if (standing) {
                        throw new exclusion_rule_exception_1.ExclusionRuleException(`Bạn đã giành Vé Thẳng trong chặng này và bị khóa không được tham gia tiếp nội dung ${scope === 'CATEGORY' ? 'này' : 'thi đấu thuộc chặng'}.`);
                    }
                }
            }
            const [participant] = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamInviteToken, teamInviteToken)))
                .for('update')
                .limit(1);
            if (!participant) {
                throw new common_1.BadRequestException('Mã mời đồng đội hoặc đội thi đấu không hợp lệ.');
            }
            const teamConfig = (tournament.tournamentConfig || {});
            const isTeamSport = (0, football_team_config_1.resolveFootballTeamConfig)(teamConfig).isTeamSport;
            if (!isTeamSport) {
                if (!participant.partnerInviteExpiresAt ||
                    new Date() >= participant.partnerInviteExpiresAt) {
                    await tx
                        .update(schema.tournamentParticipants)
                        .set({
                        teamStatus: 'EXPIRED',
                        teamInviteToken: null,
                        partnerInviteExpiresAt: null,
                    })
                        .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId));
                    throw new common_1.BadRequestException('Mã mời ghép đôi đã hết hạn. Suất giữ chỗ đã được giải phóng.');
                }
                if (participant.teamStatus !== 'PENDING_PARTNER') {
                    throw new common_1.BadRequestException('Đội thi đấu này đã đủ thành viên hoặc không ở trạng thái chờ.');
                }
                if (participant.partnerUserId && participant.partnerUserId !== userId) {
                    throw new common_1.BadRequestException('Chỉ đúng tài khoản đồng đội đã được mời mới có thể tham gia đội này.');
                }
            }
            const existingRosters = await tx
                .select({ userId: schema.tournamentRosters.userId })
                .from(schema.tournamentRosters)
                .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
            if (existingRosters.length > 0) {
                throw new common_1.BadRequestException('Bạn đã đăng ký tham gia giải đấu này rồi.');
            }
            const [division] = participant.tournamentDivisionId
                ? await tx
                    .select()
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, participant.tournamentDivisionId))
                    .limit(1)
                : [null];
            const registrationDeadlines = [
                tournament.registrationEndDate,
                division?.registrationEndDate,
            ]
                .filter(Boolean)
                .map((value) => new Date(value));
            const registrationDeadline = registrationDeadlines.sort((a, b) => a.getTime() - b.getTime())[0];
            if (registrationDeadline && new Date() >= registrationDeadline) {
                await tx
                    .update(schema.tournamentParticipants)
                    .set({
                    teamStatus: 'EXPIRED',
                    teamInviteToken: null,
                    partnerInviteExpiresAt: null,
                })
                    .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId));
                throw new common_1.BadRequestException('Giải đấu đã đóng đăng ký. Mã mời ghép đôi không thể sử dụng thêm.');
            }
            const leaderRoster = await tx
                .select()
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId))
                .limit(1);
            if (leaderRoster.length === 0) {
                throw new common_1.BadRequestException('Không tìm thấy trưởng nhóm.');
            }
            const leaderId = leaderRoster[0].userId;
            const [leaderProfile] = await tx
                .select({ gender: schema.profiles.gender })
                .from(schema.profiles)
                .where((0, drizzle_orm_1.eq)(schema.profiles.userId, leaderId))
                .limit(1);
            const [partnerProfile] = await tx
                .select({ gender: schema.profiles.gender })
                .from(schema.profiles)
                .where((0, drizzle_orm_1.eq)(schema.profiles.userId, userId))
                .limit(1);
            const teamLeaderGender = this.normalizeGender(leaderProfile?.gender);
            const teamPartnerGender = this.normalizeGender(partnerProfile?.gender);
            if (!isTeamSport && division) {
                if ((teamLeaderGender !== 'MALE' && teamLeaderGender !== 'FEMALE') ||
                    (teamPartnerGender !== 'MALE' && teamPartnerGender !== 'FEMALE')) {
                    throw new common_1.BadRequestException('Cả hai VĐV cần cập nhật giới tính trong hồ sơ để tham gia.');
                }
                const targetGenderRestriction = teamLeaderGender === teamPartnerGender ? teamLeaderGender : 'MIXED';
                const targetMatchType = targetGenderRestriction === 'MIXED' ? 'MIXED_DOUBLES' : 'DOUBLES';
                const divGender = this.normalizeGender(division.genderRestriction) ??
                    (division.genderRestriction || '').toUpperCase();
                const isMatchTypeValid = division.matchType === targetMatchType ||
                    (division.matchType === 'DOUBLES' &&
                        targetMatchType === 'MIXED_DOUBLES' &&
                        (!divGender || divGender === 'OPEN'));
                if (!isMatchTypeValid ||
                    (divGender &&
                        divGender !== 'OPEN' &&
                        divGender !== targetGenderRestriction)) {
                    throw new common_1.BadRequestException('Đồng đội không phù hợp với hình thức thi đấu đã đăng ký.');
                }
            }
            else if (!isTeamSport && tournament.genderRestriction) {
                if (!teamPartnerGender) {
                    throw new common_1.BadRequestException('Vui lòng cập nhật giới tính trong hồ sơ để tham gia.');
                }
                const restriction = this.normalizeGender(tournament.genderRestriction) ??
                    tournament.genderRestriction.toUpperCase();
                if (restriction === 'MALE' && teamPartnerGender !== 'MALE') {
                    throw new common_1.BadRequestException('Giải đấu chỉ dành cho Nam.');
                }
                if (restriction === 'FEMALE' && teamPartnerGender !== 'FEMALE') {
                    throw new common_1.BadRequestException('Giải đấu chỉ dành cho Nữ.');
                }
                if (restriction === 'MIXED') {
                    if (!teamLeaderGender) {
                        throw new common_1.BadRequestException('Không tìm thấy giới tính của trưởng nhóm để xác nhận Mixed Doubles.');
                    }
                    if (teamLeaderGender === teamPartnerGender) {
                        throw new common_1.BadRequestException('Giải đấu Mixed Doubles yêu cầu 1 Nam và 1 Nữ.');
                    }
                }
            }
            if (isTeamSport) {
                const maxTeamSize = (0, football_team_config_1.resolveFootballTeamConfig)(teamConfig).maxTotalSize;
                if (Number.isFinite(maxTeamSize) && maxTeamSize > 0) {
                    const [countRes] = await tx
                        .select({ total: (0, drizzle_orm_1.sql) `count(*)::int` })
                        .from(schema.tournamentRosters)
                        .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId));
                    if (Number(countRes?.total ?? 0) >= maxTeamSize) {
                        throw new common_1.BadRequestException('Đội đã đủ số thành viên tối đa.');
                    }
                }
            }
            await tx.insert(schema.tournamentRosters).values({
                participantId: participant.id,
                userId: userId,
                role: 'MAIN',
            });
            const entryFeeAmount = division?.entryFee
                ? parseFloat(division.entryFee)
                : parseFloat(tournament.entryFee || '0');
            const isPaid = entryFeeAmount === 0;
            const tCfg = (tournament.tournamentConfig || {});
            const rawRegMode = tCfg.registrationMode || 'OPEN';
            const regMode = rawRegMode;
            const targetStatus = regMode === 'APPROVAL' ? 'PENDING_APPROVAL' : 'COMPLETE';
            const [updatedParticipant] = await tx
                .update(schema.tournamentParticipants)
                .set({
                teamStatus: targetStatus,
                isPaid,
            })
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .returning();
            const paymentUrl = null;
            await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, participant, updatedParticipant);
            return {
                participant: updatedParticipant,
                paymentUrl,
            };
        });
    }
    async withdraw(tournamentId, userId, bankData, divisionId) {
        return await this.db.transaction(async (tx) => {
            const userRoster = await tx
                .select({ participantId: schema.tournamentRosters.participantId })
                .from(schema.tournamentRosters)
                .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId), ...(divisionId
                ? [
                    (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId),
                ]
                : []), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')))
                .limit(1);
            if (userRoster.length === 0) {
                throw new common_1.BadRequestException('Bạn chưa đăng ký giải đấu này hoặc đã rút lui.');
            }
            const participantId = userRoster[0].participantId;
            const [oldParticipant] = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .limit(1);
            if (!oldParticipant)
                throw new common_1.NotFoundException('Không tìm thấy người tham gia');
            const [tournament] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .limit(1);
            if (!tournament)
                throw new common_1.NotFoundException('Giải đấu không tồn tại');
            if (tournament.status === 'IN_PROGRESS' ||
                tournament.status === 'COMPLETED') {
                throw new common_1.BadRequestException('Giải đấu đã bắt đầu hoặc kết thúc, không thể rút lui.');
            }
            const [profile] = await tx
                .select()
                .from(schema.profiles)
                .where((0, drizzle_orm_1.eq)(schema.profiles.userId, userId))
                .limit(1);
            const finalBankName = bankData?.bankName || profile?.bankName;
            const finalBankAccountNumber = bankData?.bankAccountNumber || profile?.bankAccountNumber;
            const finalBankAccountName = bankData?.bankAccountName || profile?.bankAccountName;
            const entryFeeAmount = await this.resolveDivisionEntryFee(tx, tournament, oldParticipant.tournamentDivisionId);
            if (oldParticipant.isPaid) {
                if (entryFeeAmount > 0) {
                    if (!finalBankName?.trim() ||
                        !finalBankAccountNumber?.trim() ||
                        !finalBankAccountName?.trim()) {
                        throw new common_1.BadRequestException('Vui lòng nhập đầy đủ thông tin tài khoản ngân hàng để nhận lại tiền hoàn lệ phí.');
                    }
                }
            }
            const [updatedParticipant] = await tx
                .update(schema.tournamentParticipants)
                .set({ teamStatus: 'WITHDRAWN', teamInviteToken: null })
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .returning();
            await this.invalidatePendingParticipantPayments(tx, tournamentId, participantId, 'PARTICIPANT_WITHDRAWN');
            let refundAmount = null;
            if (oldParticipant.isPaid) {
                if (entryFeeAmount > 0) {
                    await tx
                        .update(schema.payments)
                        .set({
                        refundStatus: 'PENDING_REFUND',
                        refundedAmount: '0.00',
                        refundBankName: finalBankName,
                        refundAccountNumber: finalBankAccountNumber,
                        refundAccountName: finalBankAccountName,
                    })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.payments.participantId, participantId), (0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED')));
                    refundAmount = entryFeeAmount.toString();
                }
            }
            await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, oldParticipant, updatedParticipant);
            await this.promoteNextWaitlisted(tx, tournamentId, oldParticipant.tournamentDivisionId ?? undefined);
            return {
                message: 'Đã rút khỏi giải đấu thành công. Yêu cầu hoàn tiền đang được Ban tổ chức xử lý.',
                refundAmount,
            };
        });
    }
    async kickParticipant(tournamentId, participantId, userId) {
        return await this.db.transaction(async (tx) => {
            const [tournament] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .limit(1);
            if (!tournament)
                throw new common_1.NotFoundException('Giải đấu không tồn tại');
            const [participant] = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .limit(1);
            if (!participant)
                throw new common_1.NotFoundException('Không tìm thấy người tham gia');
            if (participant.tournamentId !== tournamentId) {
                throw new common_1.NotFoundException('Người tham gia không thuộc giải đấu này');
            }
            if (['COMPLETED', 'CANCELLED'].includes(tournament.status)) {
                throw new common_1.BadRequestException('Giải đấu đã kết thúc, không thể kick người tham gia.');
            }
            const [updatedParticipant] = await tx
                .update(schema.tournamentParticipants)
                .set({ teamStatus: 'KICKED', teamInviteToken: null })
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .returning();
            await this.invalidatePendingParticipantPayments(tx, tournamentId, participantId, 'PARTICIPANT_KICKED');
            let refundAmount = null;
            if (participant.isPaid) {
                const entryFeeAmount = await this.resolveDivisionEntryFee(tx, tournament, participant.tournamentDivisionId);
                if (entryFeeAmount > 0) {
                    await tx
                        .update(schema.payments)
                        .set({
                        refundStatus: 'PENDING_REFUND',
                        refundedAmount: '0.00',
                    })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.payments.participantId, participantId), (0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED')));
                    refundAmount = entryFeeAmount.toString();
                }
            }
            const activeMatches = await tx
                .select()
                .from(schema.matches)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.matches.status, 'SCHEDULED'), (0, drizzle_orm_1.eq)(schema.matches.status, 'ONGOING')), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.matches.participant1Id, participantId), (0, drizzle_orm_1.eq)(schema.matches.participant2Id, participantId))));
            for (const match of activeMatches) {
                const opponentId = match.participant1Id === participantId
                    ? match.participant2Id
                    : match.participant1Id;
                const winnerId = opponentId || null;
                await tx
                    .update(schema.matches)
                    .set({
                    status: 'COMPLETED',
                    winnerId,
                    completedAt: new Date(),
                    updatedAt: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(schema.matches.id, match.id));
                if (match.nextMatchId && winnerId) {
                    const [nextMatch] = await tx
                        .select()
                        .from(schema.matches)
                        .where((0, drizzle_orm_1.eq)(schema.matches.id, match.nextMatchId))
                        .limit(1);
                    const targetSlot = (0, bracket_advancement_helper_1.resolveWinnerTargetSlot)({
                        sourceBranch: match.bracketBranch,
                        sourceRoundNumber: match.roundNumber,
                        sourceMatchOrder: match.matchOrder,
                        targetBranch: nextMatch?.bracketBranch ?? 'MAIN',
                    });
                    const updateField = { [targetSlot]: winnerId };
                    await tx
                        .update(schema.matches)
                        .set(updateField)
                        .where((0, drizzle_orm_1.eq)(schema.matches.id, match.nextMatchId));
                }
                if (match.loserNextMatchId) {
                    const targetSlot = (0, bracket_advancement_helper_1.resolveLoserTargetSlot)({
                        sourceRoundNumber: match.roundNumber,
                        sourceMatchOrder: match.matchOrder,
                    });
                    const updateField = { [targetSlot]: null };
                    await tx
                        .update(schema.matches)
                        .set(updateField)
                        .where((0, drizzle_orm_1.eq)(schema.matches.id, match.loserNextMatchId));
                }
            }
            await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, participant, updatedParticipant);
            await this.promoteNextWaitlisted(tx, tournamentId, participant.tournamentDivisionId ?? undefined);
            return {
                message: 'Đội thi đấu đã bị kick và hoàn tiền thành công.',
                refundAmount,
            };
        });
    }
    async myRegistration(tournamentId, userId, divisionId) {
        const userRoster = await this.db
            .select({ participantId: schema.tournamentRosters.participantId })
            .from(schema.tournamentRosters)
            .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId), ...(divisionId
            ? [
                (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId),
            ]
            : []), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'EXPIRED')))
            .limit(1);
        if (userRoster.length === 0) {
            return { registered: false };
        }
        const participantId = userRoster[0].participantId;
        const [participant] = await this.db
            .select()
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
            .limit(1);
        const members = await this.db
            .select({
            userId: schema.tournamentRosters.userId,
            role: schema.tournamentRosters.role,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
        })
            .from(schema.tournamentRosters)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, schema.users.id))
            .innerJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId));
        return {
            registered: true,
            participant: {
                id: participant.id,
                teamName: participant.teamName,
                teamStatus: participant.teamStatus,
                partnerUserId: participant.partnerUserId,
                isPaid: participant.isPaid,
                tournamentDivisionId: participant.tournamentDivisionId,
                registeredAt: participant.registeredAt,
                teamInviteToken: participant.teamInviteToken,
                partnerInviteExpiresAt: participant.partnerInviteExpiresAt,
                members,
                teamMembers: members,
                teamInviteLink: participant.teamStatus === 'PENDING_PARTNER' &&
                    participant.registeredBy === userId &&
                    participant.teamInviteToken
                    ? `/tournaments/${tournamentId}/join-team?pid=${participant.id}&token=${participant.teamInviteToken}`
                    : null,
            },
        };
    }
    async findParticipantByTournamentAndUser(tournamentId, userId) {
        const [participant] = await this.db
            .select({ participant: schema.tournamentParticipants })
            .from(schema.tournamentParticipants)
            .innerJoin(schema.tournamentRosters, (0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, schema.tournamentRosters.participantId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')))
            .limit(1);
        return participant?.participant ?? null;
    }
    async countParticipants(tournamentId) {
        const [result] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId));
        return result?.count ?? 0;
    }
    async findCommunitySports(communityId) {
        return this.db
            .select({
            categoryId: schema.communitySports.categoryId,
            categoryName: schema.categories.name,
        })
            .from(schema.communitySports)
            .innerJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.communitySports.categoryId, schema.categories.id))
            .where((0, drizzle_orm_1.eq)(schema.communitySports.communityId, communityId));
    }
    async findFootballTeamForRegistration(teamId, userId) {
        const activeBan = this.db
            .select({ id: schema.userBans.id })
            .from(schema.userBans)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userBans.userId, schema.users.id), (0, drizzle_orm_1.eq)(schema.userBans.isActive, true), (0, drizzle_orm_1.inArray)(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema.userBans.expiresAt), (0, drizzle_orm_1.gt)(schema.userBans.expiresAt, new Date()))));
        const [team] = await this.db
            .select({
            team: schema.footballTeams,
            membership: schema.footballTeamMembers,
        })
            .from(schema.footballTeams)
            .innerJoin(schema.footballTeamMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, schema.footballTeams.id), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE')))
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.users.id, schema.footballTeamMembers.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeams.id, teamId), (0, drizzle_orm_1.isNull)(schema.users.deletedAt), (0, drizzle_orm_1.eq)(schema.users.isMock, false), (0, drizzle_orm_1.notExists)(activeBan)))
            .limit(1);
        if (!team)
            return null;
        const members = await this.db
            .select({
            userId: schema.footballTeamMembers.userId,
            role: schema.footballTeamMembers.role,
        })
            .from(schema.footballTeamMembers)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.users.id, schema.footballTeamMembers.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'), (0, drizzle_orm_1.isNull)(schema.users.deletedAt), (0, drizzle_orm_1.eq)(schema.users.isMock, false), (0, drizzle_orm_1.notExists)(activeBan)));
        return { ...team.team, membership: team.membership, members };
    }
    async findCommunityById(communityId) {
        const [record] = await this.db
            .select({
            id: schema.communities.id,
            name: schema.communities.name,
            joinMode: schema.communities.joinMode,
        })
            .from(schema.communities)
            .where((0, drizzle_orm_1.eq)(schema.communities.id, communityId))
            .limit(1);
        return record || null;
    }
    async findCommunityMember(communityId, userId) {
        const records = await this.db
            .select()
            .from(schema.communityMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
            .limit(1);
        return records[0];
    }
    async findUserProfile(userId) {
        const [profile] = await this.db
            .select({
            fullName: schema.profiles.fullName,
            phoneNumber: schema.profiles.phoneNumber,
            dateOfBirth: schema.profiles.dateOfBirth,
            gender: schema.profiles.gender,
        })
            .from(schema.profiles)
            .where((0, drizzle_orm_1.eq)(schema.profiles.userId, userId))
            .limit(1);
        return profile ?? null;
    }
    async findParticipants(tournamentId, categoryId, divisionId, onlyEligible = false) {
        const participants = await this.db
            .select({
            id: schema.tournamentParticipants.id,
            teamName: schema.tournamentParticipants.teamName,
            footballTeamId: schema.tournamentParticipants.footballTeamId,
            footballTeamLogoUrl: schema.tournamentParticipants.footballTeamLogoUrl,
            rosterLockedAt: schema.tournamentParticipants.rosterLockedAt,
            seed: schema.tournamentParticipants.seed,
            isPaid: schema.tournamentParticipants.isPaid,
            tournamentDivisionId: schema.tournamentParticipants.tournamentDivisionId,
            teamStatus: schema.tournamentParticipants.teamStatus,
            registeredAt: schema.tournamentParticipants.registeredAt,
            registeredBy: {
                id: schema.users.id,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            },
        })
            .from(schema.tournamentParticipants)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.tournamentParticipants.registeredBy, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where(divisionId
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), ...(onlyEligible
                ? [
                    (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                    (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isPaid, true),
                ]
                : []))
            : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), ...(onlyEligible
                ? [
                    (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                    (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isPaid, true),
                ]
                : [])));
        if (participants.length === 0)
            return [];
        const participantIds = participants.map((p) => p.id);
        const rosters = await this.db
            .select({
            participantId: schema.tournamentRosters.participantId,
            userId: schema.tournamentRosters.userId,
            role: schema.tournamentRosters.role,
            isMock: schema.users.isMock,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
            eloPoints: schema.userRanks.eloPoints,
            tierName: schema.eloTiers.name,
            footballTeamEloPoints: schema.footballTeamRanks.eloPoints,
        })
            .from(schema.tournamentRosters)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .leftJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
            .leftJoin(schema.userRanks, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, schema.userRanks.userId), (0, drizzle_orm_1.eq)(schema.userRanks.categoryId, categoryId)))
            .leftJoin(schema.eloTiers, (0, drizzle_orm_1.eq)(schema.userRanks.tierId, schema.eloTiers.id))
            .leftJoin(schema.footballTeamRanks, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.footballTeamId, schema.footballTeamRanks.teamId), (0, drizzle_orm_1.eq)(schema.footballTeamRanks.categoryId, categoryId)))
            .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, participantIds));
        const rostersMap = new Map();
        for (const r of rosters) {
            const list = rostersMap.get(r.participantId) || [];
            list.push({
                userId: r.userId,
                fullName: r.fullName,
                avatarUrl: r.avatarUrl,
                role: r.role,
                isMock: r.isMock ?? false,
                elo: r.isMock
                    ? {
                        eloPoints: 1000,
                        tierName: 'Chưa xếp hạng',
                    }
                    : {
                        eloPoints: r.eloPoints ?? 1000,
                        tierName: r.tierName ?? 'Beginner',
                    },
            });
            rostersMap.set(r.participantId, list);
        }
        const pairQueries = [];
        for (const members of rostersMap.values()) {
            if (members.length === 2) {
                const uids = members.map((m) => m.userId).sort();
                const andQuery = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.pairRanks.user1Id, uids[0]), (0, drizzle_orm_1.eq)(schema.pairRanks.user2Id, uids[1]), (0, drizzle_orm_1.eq)(schema.pairRanks.categoryId, categoryId));
                if (andQuery) {
                    pairQueries.push(andQuery);
                }
            }
        }
        const pairEloMap = new Map();
        if (pairQueries.length > 0) {
            const dbPairs = await this.db
                .select({
                user1Id: schema.pairRanks.user1Id,
                user2Id: schema.pairRanks.user2Id,
                eloPoints: schema.pairRanks.eloPoints,
            })
                .from(schema.pairRanks)
                .where((0, drizzle_orm_1.or)(...pairQueries));
            for (const p of dbPairs) {
                pairEloMap.set(`${p.user1Id}_${p.user2Id}`, p.eloPoints);
            }
        }
        return participants.map((p) => {
            const members = rostersMap.get(p.id) || [];
            let eloPoints = 1000;
            if (p.footballTeamId) {
                eloPoints = (rosters.find((row) => row.participantId === p.id)?.footballTeamEloPoints) ?? 1000;
            }
            else if (members.length === 1) {
                eloPoints = members[0].elo?.eloPoints ?? 1000;
            }
            else if (members.length === 2) {
                const sortedUids = members.map((m) => m.userId).sort();
                const pairKey = `${sortedUids[0]}_${sortedUids[1]}`;
                eloPoints = pairEloMap.get(pairKey) ?? 1000;
            }
            return {
                ...p,
                members,
                eloPoints,
            };
        });
    }
    async findPublicParticipants(tournamentId, categoryId, divisionId) {
        return this.findParticipants(tournamentId, categoryId, divisionId, false);
    }
    async findOpsAuditLogs(tournamentId, divisionId, limit = 50) {
        const stageRows = divisionId
            ? await this.db
                .select({ id: schema.tournamentStages.id })
                .from(schema.tournamentStages)
                .where((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId))
            : [];
        const stageIds = stageRows.map((row) => row.id);
        const participantRows = await this.db
            .select({ id: schema.tournamentParticipants.id })
            .from(schema.tournamentParticipants)
            .where(divisionId
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId))
            : (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId));
        const matchRows = await this.db
            .select({ id: schema.matches.id })
            .from(schema.matches)
            .where(divisionId
            ? stageIds.length > 0
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, tournamentId), (0, drizzle_orm_1.inArray)(schema.matches.stageId, stageIds))
                : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, tournamentId), (0, drizzle_orm_1.sql) `1 = 0`)
            : (0, drizzle_orm_1.eq)(schema.matches.tournamentId, tournamentId));
        const participantIds = participantRows.map((row) => row.id);
        const matchIds = matchRows.map((row) => row.id);
        const auditConditions = [
            (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.auditLogs.tableName, 'tournaments'), (0, drizzle_orm_1.eq)(schema.auditLogs.recordId, tournamentId)),
        ];
        if (participantIds.length > 0) {
            auditConditions.push((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.auditLogs.tableName, 'tournament_participants'), (0, drizzle_orm_1.inArray)(schema.auditLogs.recordId, participantIds)));
        }
        if (matchIds.length > 0) {
            auditConditions.push((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.auditLogs.tableName, 'matches'), (0, drizzle_orm_1.inArray)(schema.auditLogs.recordId, matchIds)));
        }
        return this.db
            .select({
            id: schema.auditLogs.id,
            userId: schema.auditLogs.userId,
            action: schema.auditLogs.action,
            tableName: schema.auditLogs.tableName,
            recordId: schema.auditLogs.recordId,
            oldValues: schema.auditLogs.oldValues,
            newValues: schema.auditLogs.newValues,
            createdAt: schema.auditLogs.createdAt,
            user: {
                email: schema.users.email,
                fullName: schema.profiles.fullName,
            },
        })
            .from(schema.auditLogs)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.auditLogs.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.or)(...auditConditions))
            .orderBy((0, drizzle_orm_1.desc)(schema.auditLogs.createdAt))
            .limit(limit);
    }
    async findBracket(tournamentId, divisionId) {
        const stages = await this.db
            .select()
            .from(schema.tournamentStages)
            .where((0, drizzle_orm_1.and)(divisionId
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId))
            : (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.isNull)(schema.tournamentStages.deletedAt)))
            .orderBy(schema.tournamentStages.order);
        if (stages.length === 0)
            return { stages: [] };
        const stageIds = stages.map((s) => s.id);
        const groups = await this.db
            .select()
            .from(schema.tournamentGroups)
            .where((0, drizzle_orm_1.inArray)(schema.tournamentGroups.stageId, stageIds));
        const groupIds = groups.map((g) => g.id);
        let matchesList = [];
        if (groupIds.length > 0) {
            const dbMatches = await this.db
                .select()
                .from(schema.matches)
                .where((0, drizzle_orm_1.inArray)(schema.matches.groupId, groupIds))
                .orderBy(schema.matches.roundNumber, schema.matches.matchOrder);
            const participants = await this.db
                .select({
                id: schema.tournamentParticipants.id,
                teamName: schema.tournamentParticipants.teamName,
                logoUrl: schema.tournamentParticipants.footballTeamLogoUrl,
                seed: schema.tournamentParticipants.seed,
            })
                .from(schema.tournamentParticipants)
                .where(divisionId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId))
                : (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId));
            const rosters = await this.db
                .select({
                participantId: schema.tournamentRosters.participantId,
                userId: schema.tournamentRosters.userId,
                fullName: schema.profiles.fullName,
            })
                .from(schema.tournamentRosters)
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, schema.profiles.userId))
                .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, participants.map((p) => p.id)));
            const rostersMap = new Map();
            for (const r of rosters) {
                const list = rostersMap.get(r.participantId) || [];
                list.push({ userId: r.userId, fullName: r.fullName });
                rostersMap.set(r.participantId, list);
            }
            const participantMap = new Map(participants.map((p) => [
                p.id,
                {
                    ...p,
                    members: rostersMap.get(p.id) || [],
                },
            ]));
            matchesList = dbMatches.map((m) => ({
                ...m,
                participant1: m.participant1Id
                    ? participantMap.get(m.participant1Id)
                    : null,
                participant2: m.participant2Id
                    ? participantMap.get(m.participant2Id)
                    : null,
            }));
        }
        const groupsMap = new Map();
        for (const g of groups) {
            const groupMatches = matchesList.filter((m) => m.groupId === g.id);
            const list = groupsMap.get(g.stageId) || [];
            list.push({
                id: g.id,
                name: g.name,
                roundConfig: g.roundConfig || null,
                matches: groupMatches,
            });
            groupsMap.set(g.stageId, list);
        }
        return {
            stages: stages.map((s) => ({
                id: s.id,
                name: s.name,
                type: s.type,
                order: s.order,
                roundConfig: s.roundConfig || null,
                matchSettings: s.matchSettings || null,
                groups: groupsMap.get(s.id) || [],
            })),
        };
    }
    async findByInviteCode(inviteCode) {
        const result = await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.inviteCode, inviteCode))
            .limit(1);
        if (result.length === 0)
            return null;
        return result[0];
    }
    async countActiveTournamentsByUser(userId) {
        const result = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.createdBy, userId), (0, drizzle_orm_1.sql) `${schema.tournaments.deletedAt} IS NULL`));
        return Number(result[0]?.count || 0);
    }
    async countCreatedTournaments(userId) {
        const [result] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.createdBy, userId), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)));
        return Number(result?.count || 0);
    }
    async findMyTournaments(userId) {
        const created = await this.db
            .select({ id: schema.tournaments.id })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.createdBy, userId), (0, drizzle_orm_1.sql) `${schema.tournaments.deletedAt} IS NULL`));
        const joined = await this.db
            .select({ id: schema.tournaments.id })
            .from(schema.tournaments)
            .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournaments.id, schema.tournamentParticipants.tournamentId))
            .innerJoin(schema.tournamentRosters, (0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, schema.tournamentRosters.participantId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId), (0, drizzle_orm_1.sql) `${schema.tournaments.deletedAt} IS NULL`));
        const coOrganized = await this.db
            .select({ id: schema.tournaments.id })
            .from(schema.tournaments)
            .innerJoin(schema.tournamentStaff, (0, drizzle_orm_1.eq)(schema.tournaments.id, schema.tournamentStaff.tournamentId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStaff.userId, userId), (0, drizzle_orm_1.eq)(schema.tournamentStaff.role, 'CO_ORGANIZER'), (0, drizzle_orm_1.sql) `${schema.tournaments.deletedAt} IS NULL`));
        const ids = Array.from(new Set([
            ...created.map((t) => t.id),
            ...joined.map((t) => t.id),
            ...coOrganized.map((t) => t.id),
        ]));
        if (ids.length === 0)
            return [];
        return await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.tournaments.id, ids), (0, drizzle_orm_1.sql) `${schema.tournaments.deletedAt} IS NULL`));
    }
    async findMyWorkspace(userId) {
        const tournamentSummarySelect = {
            id: schema.tournaments.id,
            name: schema.tournaments.name,
            status: schema.tournaments.status,
            startDate: schema.tournaments.startDate,
            endDate: schema.tournaments.endDate,
            registrationEndDate: schema.tournaments.registrationEndDate,
            locationAddress: schema.tournamentVenues.locationAddress,
            matchType: schema.tournaments.matchType,
            tournamentType: schema.tournaments.tournamentType,
            logoUrl: schema.tournaments.logoUrl,
            categoryId: schema.tournaments.categoryId,
            tournamentConfig: schema.tournaments.tournamentConfig,
            category: {
                id: schema.categories.id,
                name: schema.categories.name,
                slug: schema.categories.slug,
            },
        };
        const [organizedRaw, participatingRaw, coOrganizerRaw, refereeInvites, refereeTournaments, refereeMatchesRaw,] = await Promise.all([
            this.db
                .select(tournamentSummarySelect)
                .from(schema.tournaments)
                .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.tournaments.categoryId, schema.categories.id))
                .leftJoin(schema.tournamentVenues, (0, drizzle_orm_1.eq)(schema.tournaments.venueId, schema.tournamentVenues.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.createdBy, userId), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
                .orderBy((0, drizzle_orm_1.desc)(schema.tournaments.updatedAt)),
            this.db
                .select(tournamentSummarySelect)
                .from(schema.tournamentRosters)
                .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
                .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, schema.tournaments.id))
                .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.tournaments.categoryId, schema.categories.id))
                .leftJoin(schema.tournamentVenues, (0, drizzle_orm_1.eq)(schema.tournaments.venueId, schema.tournamentVenues.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
                .orderBy((0, drizzle_orm_1.desc)(schema.tournaments.updatedAt)),
            this.db
                .select(tournamentSummarySelect)
                .from(schema.tournamentStaff)
                .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentStaff.tournamentId, schema.tournaments.id))
                .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.tournaments.categoryId, schema.categories.id))
                .leftJoin(schema.tournamentVenues, (0, drizzle_orm_1.eq)(schema.tournaments.venueId, schema.tournamentVenues.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStaff.userId, userId), (0, drizzle_orm_1.eq)(schema.tournamentStaff.role, 'CO_ORGANIZER'), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
                .orderBy((0, drizzle_orm_1.desc)(schema.tournaments.updatedAt)),
            this.db
                .select({
                refereeId: schema.tournamentReferees.id,
                tournamentId: schema.tournamentReferees.tournamentId,
                tournamentName: schema.tournaments.name,
                logoUrl: schema.tournaments.logoUrl,
                tournamentStatus: schema.tournaments.status,
                categoryName: schema.categories.name,
                assignedAt: schema.tournamentReferees.createdAt,
                status: schema.tournamentReferees.status,
            })
                .from(schema.tournamentReferees)
                .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentReferees.tournamentId, schema.tournaments.id))
                .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.tournaments.categoryId, schema.categories.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentReferees.userId, userId), (0, drizzle_orm_1.eq)(schema.tournamentReferees.status, 'INVITED'), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
                .orderBy((0, drizzle_orm_1.desc)(schema.tournamentReferees.createdAt)),
            this.db
                .select({
                refereeId: schema.tournamentReferees.id,
                tournamentId: schema.tournamentReferees.tournamentId,
                tournamentName: schema.tournaments.name,
                logoUrl: schema.tournaments.logoUrl,
                tournamentStatus: schema.tournaments.status,
                categoryName: schema.categories.name,
                assignedAt: schema.tournamentReferees.createdAt,
                status: schema.tournamentReferees.status,
            })
                .from(schema.tournamentReferees)
                .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentReferees.tournamentId, schema.tournaments.id))
                .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.tournaments.categoryId, schema.categories.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentReferees.userId, userId), (0, drizzle_orm_1.eq)(schema.tournamentReferees.status, 'ACCEPTED'), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
                .orderBy((0, drizzle_orm_1.desc)(schema.tournamentReferees.createdAt)),
            this.db
                .select({
                id: schema.matches.id,
                tournamentId: schema.tournaments.id,
                tournamentName: schema.tournaments.name,
                logoUrl: schema.tournaments.logoUrl,
                categoryName: schema.categories.name,
                stageName: schema.tournamentStages.name,
                groupName: schema.tournamentGroups.name,
                roundNumber: schema.matches.roundNumber,
                matchOrder: schema.matches.matchOrder,
                status: schema.matches.status,
                scheduledAt: schema.matches.scheduledAt,
                courtName: schema.matches.courtName,
                participant1Id: schema.matches.participant1Id,
                participant2Id: schema.matches.participant2Id,
            })
                .from(schema.matches)
                .innerJoin(schema.tournamentStages, (0, drizzle_orm_1.eq)(schema.matches.stageId, schema.tournamentStages.id))
                .innerJoin(schema.tournamentGroups, (0, drizzle_orm_1.eq)(schema.matches.groupId, schema.tournamentGroups.id))
                .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, schema.tournaments.id))
                .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.tournaments.categoryId, schema.categories.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.refereeId, userId), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
                .orderBy((0, drizzle_orm_1.asc)(schema.matches.scheduledAt), (0, drizzle_orm_1.asc)(schema.matches.roundNumber), (0, drizzle_orm_1.asc)(schema.matches.matchOrder)),
        ]);
        const organizedIds = new Set(organizedRaw.map((tournament) => tournament.id));
        const dedupeByTournamentId = (items) => {
            const map = new Map();
            for (const item of items) {
                if (!map.has(item.id)) {
                    map.set(item.id, item);
                }
            }
            return Array.from(map.values());
        };
        const participantIds = Array.from(new Set(refereeMatchesRaw.flatMap((match) => [match.participant1Id, match.participant2Id].filter((id) => Boolean(id)))));
        const participants = participantIds.length > 0
            ? await this.db
                .select({
                id: schema.tournamentParticipants.id,
                teamName: schema.tournamentParticipants.teamName,
            })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.id, participantIds))
            : [];
        const participantsMap = new Map(participants.map((participant) => [participant.id, participant.teamName]));
        return {
            organizedTournaments: dedupeByTournamentId(organizedRaw),
            participatingTournaments: dedupeByTournamentId(participatingRaw.filter((tournament) => !organizedIds.has(tournament.id))),
            coOrganizerTournaments: dedupeByTournamentId(coOrganizerRaw.filter((tournament) => !organizedIds.has(tournament.id))),
            refereeInvites,
            refereeTournaments,
            refereeMatches: refereeMatchesRaw.map((match) => ({
                ...match,
                participant1Name: match.participant1Id
                    ? (participantsMap.get(match.participant1Id) ?? null)
                    : null,
                participant2Name: match.participant2Id
                    ? (participantsMap.get(match.participant2Id) ?? null)
                    : null,
            })),
        };
    }
    async findCategory(id) {
        const result = await this.db
            .select()
            .from(schema.categories)
            .where((0, drizzle_orm_1.eq)(schema.categories.id, id))
            .limit(1);
        if (result.length === 0)
            return null;
        return result[0];
    }
    async findByIdVenue(venueId) {
        const [venue] = await this.db
            .select()
            .from(schema.tournamentVenues)
            .where((0, drizzle_orm_1.eq)(schema.tournamentVenues.id, venueId))
            .limit(1);
        return venue || null;
    }
    async findCategoryBySlug(slug) {
        const result = await this.db
            .select()
            .from(schema.categories)
            .where((0, drizzle_orm_1.eq)(schema.categories.slug, slug))
            .limit(1);
        if (result.length === 0)
            return null;
        return result[0];
    }
    async regenerateInviteCode(id, userId) {
        return await this.db.transaction(async (tx) => {
            const newCode = await this.generateUniqueInviteCode(tx);
            const [oldRecord] = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, id))
                .limit(1);
            const [updated] = await tx
                .update(schema.tournaments)
                .set({ inviteCode: newCode, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, id))
                .returning();
            await this.auditService.logUpdate(tx, userId, 'tournaments', id, oldRecord, updated);
            return updated;
        });
    }
    async findStageById(id) {
        const result = await this.db
            .select()
            .from(schema.tournamentStages)
            .where((0, drizzle_orm_1.eq)(schema.tournamentStages.id, id))
            .limit(1);
        return result[0] || null;
    }
    async updateStage(id, userId, data) {
        return await this.db.transaction(async (tx) => {
            const [oldRecord] = await tx
                .select()
                .from(schema.tournamentStages)
                .where((0, drizzle_orm_1.eq)(schema.tournamentStages.id, id))
                .limit(1);
            if (!oldRecord)
                return null;
            const [updated] = await tx
                .update(schema.tournamentStages)
                .set({
                ...(data.name && { name: data.name }),
                ...(data.type && { type: data.type }),
                ...(data.order !== undefined && { order: data.order }),
                ...(data.roundConfig !== undefined && {
                    roundConfig: data.roundConfig,
                }),
                ...(data.venueId !== undefined && { venueId: data.venueId || null }),
                ...(data.scheduledDate !== undefined && {
                    scheduledDate: data.scheduledDate || null,
                }),
                ...(data.notificationNote !== undefined && {
                    notificationNote: data.notificationNote || null,
                }),
                ...(data.matchSettings !== undefined && {
                    matchSettings: data.matchSettings || null,
                }),
            })
                .where((0, drizzle_orm_1.eq)(schema.tournamentStages.id, id))
                .returning();
            await this.auditService.logUpdate(tx, userId, 'tournament_stages', id, oldRecord, updated);
            return updated;
        });
    }
    async findGroupById(id) {
        const result = await this.db
            .select({
            id: schema.tournamentGroups.id,
            stageId: schema.tournamentGroups.stageId,
            name: schema.tournamentGroups.name,
            roundConfig: schema.tournamentGroups.roundConfig,
            tournamentId: schema.tournamentStages.tournamentId,
        })
            .from(schema.tournamentGroups)
            .innerJoin(schema.tournamentStages, (0, drizzle_orm_1.eq)(schema.tournamentGroups.stageId, schema.tournamentStages.id))
            .where((0, drizzle_orm_1.eq)(schema.tournamentGroups.id, id))
            .limit(1);
        return result[0] || null;
    }
    async updateGroup(id, userId, data) {
        return await this.db.transaction(async (tx) => {
            const [oldRecord] = await tx
                .select()
                .from(schema.tournamentGroups)
                .where((0, drizzle_orm_1.eq)(schema.tournamentGroups.id, id))
                .limit(1);
            if (!oldRecord)
                return null;
            const [updated] = await tx
                .update(schema.tournamentGroups)
                .set({
                ...(data.name && { name: data.name }),
                ...(data.roundConfig !== undefined && {
                    roundConfig: data.roundConfig,
                }),
            })
                .where((0, drizzle_orm_1.eq)(schema.tournamentGroups.id, id))
                .returning();
            await this.auditService.logUpdate(tx, userId, 'tournament_groups', id, oldRecord, updated);
            return updated;
        });
    }
    async createParent(userId, data) {
        return await this.db.transaction(async (tx) => {
            const [record] = await tx
                .insert(schema.parentTournaments)
                .values({
                createdBy: userId,
                name: data.name,
                description: data.description || null,
                bannerUrl: data.bannerUrl || null,
                logoUrl: data.logoUrl || null,
            })
                .returning();
            await this.auditService.logCreate(tx, userId, 'parent_tournaments', record.id, record);
            return record;
        });
    }
    async updateParent(id, userId, data) {
        return await this.db.transaction(async (tx) => {
            const [oldRecord] = await tx
                .select()
                .from(schema.parentTournaments)
                .where((0, drizzle_orm_1.eq)(schema.parentTournaments.id, id))
                .limit(1);
            if (!oldRecord)
                return null;
            const [updated] = await tx
                .update(schema.parentTournaments)
                .set({
                ...(data.name && { name: data.name }),
                ...(data.description !== undefined && {
                    description: data.description,
                }),
                ...(data.bannerUrl !== undefined && { bannerUrl: data.bannerUrl }),
                ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema.parentTournaments.id, id))
                .returning();
            await this.auditService.logUpdate(tx, userId, 'parent_tournaments', id, oldRecord, updated);
            return updated;
        });
    }
    async findParentById(id) {
        const [parent] = await this.db
            .select()
            .from(schema.parentTournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.parentTournaments.id, id), (0, drizzle_orm_1.sql) `${schema.parentTournaments.deletedAt} IS NULL`))
            .limit(1);
        if (!parent)
            return null;
        const rawDivisions = await this.db
            .select({
            id: schema.tournaments.id,
            parentId: schema.tournaments.parentId,
            name: schema.tournaments.name,
            description: schema.tournaments.description,
            startDate: schema.tournaments.startDate,
            endDate: schema.tournaments.endDate,
            status: schema.tournaments.status,
            matchType: schema.tournaments.matchType,
            genderRestriction: schema.tournaments.genderRestriction,
            categoryId: schema.tournaments.categoryId,
            bannerUrl: schema.tournaments.bannerUrl,
            logoUrl: schema.tournaments.logoUrl,
            category: {
                id: schema.categories.id,
                name: schema.categories.name,
            },
        })
            .from(schema.tournaments)
            .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.tournaments.categoryId, schema.categories.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.parentId, id), (0, drizzle_orm_1.sql) `${schema.tournaments.deletedAt} IS NULL`, (0, drizzle_orm_1.sql) `${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete')`));
        const divisions = await Promise.all(rawDivisions.map(async (div) => {
            const [pCount] = await this.db
                .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, div.id), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
            return {
                ...div,
                _summary: {
                    participantCount: pCount?.count || 0,
                },
            };
        }));
        return {
            ...parent,
            divisions,
            _aggregation: {
                totalDivisions: divisions.length,
                totalParticipants: divisions.reduce((sum, d) => sum + (d._summary?.participantCount || 0), 0),
                divisionStatuses: divisions.map((d) => ({
                    name: d.name,
                    status: d.status,
                })),
            },
        };
    }
    async findByParentId(parentId) {
        return await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.parentId, parentId), (0, drizzle_orm_1.sql) `${schema.tournaments.deletedAt} IS NULL`));
    }
    async findParentsByUser(userId) {
        return await this.db
            .select()
            .from(schema.parentTournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.parentTournaments.createdBy, userId), (0, drizzle_orm_1.sql) `${schema.parentTournaments.deletedAt} IS NULL`));
    }
    async softDeleteParent(id, userId) {
        return await this.db.transaction(async (tx) => {
            const [oldRecord] = await tx
                .select()
                .from(schema.parentTournaments)
                .where((0, drizzle_orm_1.eq)(schema.parentTournaments.id, id))
                .limit(1);
            if (!oldRecord)
                return null;
            const divisions = await tx
                .select({ id: schema.tournaments.id })
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.parentId, id));
            const divisionIds = divisions.map((d) => d.id);
            const [deleted] = await tx
                .update(schema.parentTournaments)
                .set({ deletedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.parentTournaments.id, id))
                .returning();
            await tx
                .update(schema.tournaments)
                .set({ deletedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.tournaments.parentId, id));
            if (divisionIds.length > 0) {
                await tx
                    .update(schema.matches)
                    .set({ deletedAt: new Date(), updatedAt: new Date() })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.matches.tournamentId, divisionIds), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)));
            }
            await tx
                .delete(schema.notifications)
                .where((0, drizzle_orm_1.like)(schema.notifications.redirectUrl, `%/${id}%`));
            for (const divId of divisionIds) {
                await tx
                    .delete(schema.notifications)
                    .where((0, drizzle_orm_1.like)(schema.notifications.redirectUrl, `%/${divId}%`));
            }
            await this.auditService.logDelete(tx, userId, 'parent_tournaments', id, oldRecord);
            return deleted;
        });
    }
    async seedMockParticipants(tournamentId, names, divisionId) {
        return await this.db.transaction(async (tx) => {
            const tournament = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .limit(1)
                .then((res) => res[0]);
            if (!tournament)
                throw new common_1.BadRequestException('Giải đấu không tồn tại');
            let matchType = tournament.matchType;
            if (divisionId) {
                const division = await tx
                    .select()
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, divisionId))
                    .limit(1)
                    .then((res) => res[0]);
                if (division) {
                    matchType = division.matchType;
                }
            }
            const isDoubles = matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
            const createdParticipants = [];
            if (isDoubles) {
                for (let i = 0; i < names.length; i += 2) {
                    const name1 = names[i];
                    const name2 = names[i + 1] || `${name1} Partner`;
                    const mockEmail1 = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@mock.com`;
                    const mockEmail2 = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@mock.com`;
                    const [user1] = await tx
                        .insert(schema.users)
                        .values({ email: mockEmail1, isMock: true })
                        .returning();
                    await tx
                        .insert(schema.profiles)
                        .values({ userId: user1.id, fullName: name1 })
                        .returning();
                    const [user2] = await tx
                        .insert(schema.users)
                        .values({ email: mockEmail2, isMock: true })
                        .returning();
                    await tx
                        .insert(schema.profiles)
                        .values({ userId: user2.id, fullName: name2 })
                        .returning();
                    const teamName = `${name1} - ${name2}`;
                    const [participant] = await tx
                        .insert(schema.tournamentParticipants)
                        .values({
                        tournamentId,
                        tournamentDivisionId: divisionId ?? null,
                        registeredBy: user1.id,
                        teamName,
                        isPaid: true,
                        teamInviteToken: null,
                        teamStatus: 'COMPLETE',
                        isMock: true,
                    })
                        .returning();
                    await tx.insert(schema.tournamentRosters).values({
                        participantId: participant.id,
                        userId: user1.id,
                        role: 'MAIN',
                    });
                    await tx.insert(schema.tournamentRosters).values({
                        participantId: participant.id,
                        userId: user2.id,
                        role: 'MAIN',
                    });
                    createdParticipants.push(participant);
                }
            }
            else {
                for (const name of names) {
                    const mockEmail = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@mock.com`;
                    const [user] = await tx
                        .insert(schema.users)
                        .values({ email: mockEmail, isMock: true })
                        .returning();
                    await tx
                        .insert(schema.profiles)
                        .values({ userId: user.id, fullName: name })
                        .returning();
                    const [participant] = await tx
                        .insert(schema.tournamentParticipants)
                        .values({
                        tournamentId,
                        tournamentDivisionId: divisionId ?? null,
                        registeredBy: user.id,
                        teamName: name,
                        isPaid: true,
                        teamInviteToken: null,
                        teamStatus: 'COMPLETE',
                        isMock: true,
                    })
                        .returning();
                    await tx.insert(schema.tournamentRosters).values({
                        participantId: participant.id,
                        userId: user.id,
                        role: 'MAIN',
                    });
                    createdParticipants.push(participant);
                }
            }
            for (let idx = 0; idx < createdParticipants.length; idx++) {
                await tx
                    .update(schema.tournamentParticipants)
                    .set({ seed: idx + 1 })
                    .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, createdParticipants[idx].id));
            }
            return createdParticipants;
        });
    }
    async clearMockParticipants(tournamentId, divisionId) {
        return await this.db.transaction(async (tx) => {
            const mockParts = await tx
                .select({ id: schema.tournamentParticipants.id })
                .from(schema.tournamentParticipants)
                .where(divisionId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId))
                : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true)));
            if (mockParts.length === 0)
                return { count: 0 };
            const partIds = mockParts.map((p) => p.id);
            const mockRosters = await tx
                .select({ userId: schema.tournamentRosters.userId })
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, partIds));
            await tx
                .delete(schema.tournamentRosters)
                .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, partIds));
            await tx
                .update(schema.matches)
                .set({ participant1Id: null })
                .where((0, drizzle_orm_1.inArray)(schema.matches.participant1Id, partIds));
            await tx
                .update(schema.matches)
                .set({ participant2Id: null })
                .where((0, drizzle_orm_1.inArray)(schema.matches.participant2Id, partIds));
            await tx
                .update(schema.matches)
                .set({ winnerId: null })
                .where((0, drizzle_orm_1.inArray)(schema.matches.winnerId, partIds));
            await tx
                .delete(schema.tournamentStages)
                .where(divisionId
                ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId))
                : (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId));
            await tx
                .delete(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.id, partIds));
            if (mockRosters.length > 0) {
                const userIds = mockRosters.map((r) => r.userId);
                await tx
                    .delete(schema.profiles)
                    .where((0, drizzle_orm_1.inArray)(schema.profiles.userId, userIds));
                await tx
                    .delete(schema.users)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.users.id, userIds), (0, drizzle_orm_1.eq)(schema.users.isMock, true)));
            }
            return { count: partIds.length };
        });
    }
    async deleteMockParticipant(tournamentId, participantId) {
        return await this.db.transaction(async (tx) => {
            const [participant] = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId)))
                .limit(1);
            if (!participant) {
                throw new common_1.BadRequestException('Không tìm thấy người tham gia');
            }
            if (!participant.isMock) {
                throw new common_1.BadRequestException('Chỉ có thể xóa các VĐV giả lập bằng hành động này');
            }
            const mockRosters = await tx
                .select({ userId: schema.tournamentRosters.userId })
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId));
            await tx
                .delete(schema.tournamentRosters)
                .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId));
            await tx
                .update(schema.matches)
                .set({ participant1Id: null })
                .where((0, drizzle_orm_1.eq)(schema.matches.participant1Id, participantId));
            await tx
                .update(schema.matches)
                .set({ participant2Id: null })
                .where((0, drizzle_orm_1.eq)(schema.matches.participant2Id, participantId));
            await tx
                .update(schema.matches)
                .set({ winnerId: null })
                .where((0, drizzle_orm_1.eq)(schema.matches.winnerId, participantId));
            await tx
                .delete(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId));
            const userIds = Array.from(new Set(mockRosters.map((roster) => roster.userId)));
            if (userIds.length > 0) {
                await tx
                    .delete(schema.profiles)
                    .where((0, drizzle_orm_1.inArray)(schema.profiles.userId, userIds));
                await tx
                    .delete(schema.users)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.users.id, userIds), (0, drizzle_orm_1.eq)(schema.users.isMock, true)));
            }
            return { count: 1 };
        });
    }
    async updateParticipantStatus(participantId, status) {
        return this.db.transaction(async (tx) => {
            const [existing] = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .limit(1);
            if (!existing) {
                return null;
            }
            if (status === 'REJECTED' &&
                (existing.teamStatus === 'COMPLETE' ||
                    existing.teamStatus === 'APPROVED')) {
                throw new common_1.BadRequestException('Không thể từ chối đội đã được duyệt hoặc hoàn tất đăng ký.');
            }
            const [updated] = await tx
                .update(schema.tournamentParticipants)
                .set({ teamStatus: status })
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .returning();
            if (status === 'REJECTED') {
                await this.invalidatePendingParticipantPayments(tx, existing.tournamentId, participantId, 'PARTICIPANT_REJECTED');
            }
            return updated ?? null;
        });
    }
    async lockParticipantRoster(participantId, userId) {
        return this.db.transaction(async (tx) => {
            const [participant] = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .for('update')
                .limit(1);
            if (!participant)
                return null;
            if (participant.teamStatus !== 'COMPLETE' &&
                participant.teamStatus !== 'APPROVED') {
                throw new common_1.BadRequestException('Chỉ đội đã hoàn tất đăng ký mới được khóa roster.');
            }
            if (participant.rosterLockedAt)
                return participant;
            if (participant.footballTeamId && participant.tournamentDivisionId) {
                const [entry] = await tx
                    .select()
                    .from(schema.tournamentTeamEntries)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.tournamentId, participant.tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.divisionId, participant.tournamentDivisionId), (0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.teamId, participant.footballTeamId)))
                    .for('update')
                    .limit(1);
                const snapshots = entry
                    ? await tx
                        .select({
                        confirmationStatus: schema.tournamentTeamRosterSnapshots.confirmationStatus,
                        role: schema.tournamentTeamRosterSnapshots.role,
                    })
                        .from(schema.tournamentTeamRosterSnapshots)
                        .where((0, drizzle_orm_1.eq)(schema.tournamentTeamRosterSnapshots.entryId, entry.id))
                        .for('update')
                    : [];
                const [tournamentConfigRow] = await tx
                    .select({ tournamentConfig: schema.tournaments.tournamentConfig })
                    .from(schema.tournaments)
                    .where((0, drizzle_orm_1.eq)(schema.tournaments.id, participant.tournamentId))
                    .limit(1);
                (0, football_roster_lock_1.assertFootballRosterLockable)({
                    entryExists: Boolean(entry),
                    entryStatus: entry?.status,
                    confirmations: snapshots.map((row) => row.confirmationStatus),
                    mainRosterCount: snapshots.filter((row) => row.role === 'MAIN')
                        .length,
                    requiredMainRosterCount: this.getRequiredFootballMainRosterCount(tournamentConfigRow?.tournamentConfig),
                });
                if (entry?.status === 'CONFIRMED') {
                    const [lockedEntry] = await tx
                        .update(schema.tournamentTeamEntries)
                        .set({
                        status: 'LOCKED',
                        lockedAt: new Date(),
                        updatedAt: new Date(),
                    })
                        .where((0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.id, entry.id))
                        .returning();
                    await this.auditService.logUpdate(tx, userId, 'tournament_team_entries', entry.id, entry, lockedEntry);
                }
            }
            const [updated] = await tx
                .update(schema.tournamentParticipants)
                .set({ rosterLockedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .returning();
            if (updated) {
                await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, participant, updated);
            }
            return updated ?? null;
        });
    }
    async unlockParticipantRoster(participantId, userId) {
        return this.db.transaction(async (tx) => {
            const [participant] = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .for('update')
                .limit(1);
            if (!participant)
                return null;
            let entry;
            if (participant.footballTeamId && participant.tournamentDivisionId) {
                [entry] = await tx
                    .select()
                    .from(schema.tournamentTeamEntries)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.tournamentId, participant.tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.divisionId, participant.tournamentDivisionId), (0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.teamId, participant.footballTeamId)))
                    .for('update')
                    .limit(1);
            }
            if (entry?.status === 'LOCKED') {
                const [unlockedEntry] = await tx
                    .update(schema.tournamentTeamEntries)
                    .set({ status: 'CONFIRMED', lockedAt: null, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.id, entry.id))
                    .returning();
                await this.auditService.logUpdate(tx, userId, 'tournament_team_entries', entry.id, entry, unlockedEntry);
            }
            if (!participant.rosterLockedAt)
                return participant;
            const [updated] = await tx
                .update(schema.tournamentParticipants)
                .set({ rosterLockedAt: null })
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .returning();
            if (updated) {
                await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, participant, updated);
            }
            return updated ?? participant;
        });
    }
    async findFootballEntryForParticipant(participantId) {
        const [row] = await this.db
            .select({
            entry: schema.tournamentTeamEntries,
            participant: {
                tournamentId: schema.tournamentParticipants.tournamentId,
                divisionId: schema.tournamentParticipants.tournamentDivisionId,
                teamId: schema.tournamentParticipants.footballTeamId,
            },
        })
            .from(schema.tournamentParticipants)
            .leftJoin(schema.tournamentTeamEntries, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.tournamentId, schema.tournamentParticipants.tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.divisionId, schema.tournamentParticipants.tournamentDivisionId), (0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.teamId, schema.tournamentParticipants.footballTeamId)))
            .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
            .limit(1);
        return row ?? null;
    }
    async getFootballEntryRoster(entryId) {
        return this.db
            .select({
            id: schema.tournamentTeamRosterSnapshots.id,
            userId: schema.tournamentTeamRosterSnapshots.userId,
            role: schema.tournamentTeamRosterSnapshots.role,
            confirmationStatus: schema.tournamentTeamRosterSnapshots.confirmationStatus,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
        })
            .from(schema.tournamentTeamRosterSnapshots)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.profiles.userId, schema.tournamentTeamRosterSnapshots.userId))
            .where((0, drizzle_orm_1.eq)(schema.tournamentTeamRosterSnapshots.entryId, entryId));
    }
    async respondFootballRoster(entryId, userId, action) {
        return this.db.transaction(async (tx) => {
            const [snapshot] = await tx
                .select()
                .from(schema.tournamentTeamRosterSnapshots)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentTeamRosterSnapshots.entryId, entryId), (0, drizzle_orm_1.eq)(schema.tournamentTeamRosterSnapshots.userId, userId)))
                .for('update')
                .limit(1);
            if (!snapshot)
                throw new common_1.NotFoundException('Bạn không nằm trong roster đăng ký đội này.');
            await tx
                .update(schema.tournamentTeamRosterSnapshots)
                .set({
                confirmationStatus: action === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED',
            })
                .where((0, drizzle_orm_1.eq)(schema.tournamentTeamRosterSnapshots.id, snapshot.id));
            const remaining = await tx
                .select({
                confirmationStatus: schema.tournamentTeamRosterSnapshots.confirmationStatus,
                role: schema.tournamentTeamRosterSnapshots.role,
            })
                .from(schema.tournamentTeamRosterSnapshots)
                .where((0, drizzle_orm_1.eq)(schema.tournamentTeamRosterSnapshots.entryId, entryId));
            const [entry] = await tx
                .select({
                tournamentId: schema.tournamentTeamEntries.tournamentId,
            })
                .from(schema.tournamentTeamEntries)
                .where((0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.id, entryId))
                .limit(1);
            const [tournamentConfigRow] = entry
                ? await tx
                    .select({
                    tournamentConfig: schema.tournaments.tournamentConfig,
                })
                    .from(schema.tournaments)
                    .where((0, drizzle_orm_1.eq)(schema.tournaments.id, entry.tournamentId))
                    .limit(1)
                : [];
            const hasDeclined = remaining.some((row) => row.confirmationStatus === 'DECLINED');
            const hasPending = remaining.some((row) => row.confirmationStatus === 'PENDING');
            const hasUndersizedMainRoster = remaining.filter((row) => row.role === 'MAIN').length <
                this.getRequiredFootballMainRosterCount(tournamentConfigRow?.tournamentConfig);
            const nextStatus = hasUndersizedMainRoster
                ? 'DRAFT'
                : hasDeclined || hasPending
                    ? 'PENDING_CONFIRMATION'
                    : 'CONFIRMED';
            await tx
                .update(schema.tournamentTeamEntries)
                .set({
                status: nextStatus,
                confirmedAt: nextStatus === 'CONFIRMED' ? new Date() : null,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.id, entryId));
            return {
                entryId,
                confirmationStatus: action === 'CONFIRM' ? 'CONFIRMED' : 'DECLINED',
                status: nextStatus,
            };
        });
    }
    async updateFootballRoster(participantId, mainMemberIds, reserveMemberIds, actorUserId) {
        return this.db.transaction(async (tx) => {
            const [participant] = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .for('update')
                .limit(1);
            if (!participant?.footballTeamId || !participant.tournamentDivisionId) {
                throw new common_1.NotFoundException('Đăng ký đội bóng không tồn tại.');
            }
            if (participant.rosterLockedAt) {
                throw new common_1.BadRequestException('Roster đã khóa, không thể thay đổi.');
            }
            const [entry] = await tx
                .select()
                .from(schema.tournamentTeamEntries)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.tournamentId, participant.tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.divisionId, participant.tournamentDivisionId), (0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.teamId, participant.footballTeamId)))
                .for('update')
                .limit(1);
            if (!entry) {
                throw new common_1.NotFoundException('Roster đội bóng chưa được tạo.');
            }
            if (entry.status === 'LOCKED') {
                throw new common_1.BadRequestException('Roster đã khóa, không thể thay đổi.');
            }
            const [tournament] = await tx
                .select({ tournamentConfig: schema.tournaments.tournamentConfig })
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, participant.tournamentId))
                .limit(1);
            const activeMemberBan = tx
                .select({ id: schema.userBans.id })
                .from(schema.userBans)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userBans.userId, schema.users.id), (0, drizzle_orm_1.eq)(schema.userBans.isActive, true), (0, drizzle_orm_1.inArray)(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema.userBans.expiresAt), (0, drizzle_orm_1.gt)(schema.userBans.expiresAt, new Date()))));
            const teamMembers = await tx
                .select({ userId: schema.footballTeamMembers.userId })
                .from(schema.footballTeamMembers)
                .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.users.id, schema.footballTeamMembers.userId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, participant.footballTeamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'), (0, drizzle_orm_1.isNull)(schema.users.deletedAt), (0, drizzle_orm_1.eq)(schema.users.isMock, false), (0, drizzle_orm_1.notExists)(activeMemberBan)));
            const teamConfig = tournament?.tournamentConfig &&
                typeof tournament.tournamentConfig === 'object' &&
                !Array.isArray(tournament.tournamentConfig)
                ? tournament.tournamentConfig
                : {};
            const resolvedTeamConfig = (0, football_team_config_1.resolveFootballTeamConfig)(teamConfig);
            const teamSize = resolvedTeamConfig.mainSize;
            const maxReserve = resolvedTeamConfig.maxReserve;
            const maxTeamSize = resolvedTeamConfig.maxTotalSize;
            const roster = (0, football_roster_validation_1.validateFootballRosterSelection)({
                leaderId: participant.registeredBy,
                memberIds: mainMemberIds,
                reserveMemberIds,
                activeMemberIds: new Set(teamMembers.map((member) => member.userId)),
                minMainSize: 1,
                maxMainSize: teamSize,
                maxReserve,
                maxTotalSize: maxTeamSize,
            });
            const duplicateRows = await tx
                .select({ userId: schema.tournamentRosters.userId })
                .from(schema.tournamentRosters)
                .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, participant.tournamentId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.id, participantId), (0, drizzle_orm_1.inArray)(schema.tournamentRosters.userId, roster.allMemberIds), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'EXPIRED')));
            if (duplicateRows.length > 0) {
                throw new common_1.BadRequestException('Một hoặc nhiều thành viên đã đăng ký nội dung khác trong giải đấu này.');
            }
            await tx
                .delete(schema.tournamentRosters)
                .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId));
            await tx.insert(schema.tournamentRosters).values(roster.mainMemberIds.map((userId) => ({
                participantId,
                userId,
                role: 'MAIN',
            })));
            if (roster.reserveMemberIds.length > 0) {
                await tx.insert(schema.tournamentRosters).values(roster.reserveMemberIds.map((userId) => ({
                    participantId,
                    userId,
                    role: 'RESERVE',
                })));
            }
            await tx
                .delete(schema.tournamentTeamRosterSnapshots)
                .where((0, drizzle_orm_1.eq)(schema.tournamentTeamRosterSnapshots.entryId, entry.id));
            const snapshots = [...roster.mainMemberIds, ...roster.reserveMemberIds];
            await tx.insert(schema.tournamentTeamRosterSnapshots).values(snapshots.map((userId) => ({
                entryId: entry.id,
                userId,
                role: roster.mainMemberIds.includes(userId) ? 'MAIN' : 'RESERVE',
                confirmationStatus: userId === participant.registeredBy ? 'CONFIRMED' : 'PENDING',
            })));
            const requiredMainRosterCount = this.getRequiredFootballMainRosterCount(tournament?.tournamentConfig);
            const nextStatus = roster.mainMemberIds.length < requiredMainRosterCount
                ? 'DRAFT'
                : roster.mainMemberIds.length === 1 && roster.reserveMemberIds.length === 0
                    ? 'CONFIRMED'
                    : 'PENDING_CONFIRMATION';
            const [updatedEntry] = await tx
                .update(schema.tournamentTeamEntries)
                .set({
                status: nextStatus,
                confirmedAt: nextStatus === 'CONFIRMED' ? new Date() : null,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.id, entry.id))
                .returning();
            await this.auditService.logUpdate(tx, actorUserId, 'tournament_team_entries', entry.id, entry, updatedEntry);
            return {
                entry: updatedEntry,
                roster: snapshots.map((userId) => ({
                    userId,
                    role: roster.mainMemberIds.includes(userId) ? 'MAIN' : 'RESERVE',
                    confirmationStatus: userId === participant.registeredBy ? 'CONFIRMED' : 'PENDING',
                })),
            };
        });
    }
    async lockFootballEntry(entryId, userId) {
        return this.db.transaction(async (tx) => {
            const [entry] = await tx
                .select()
                .from(schema.tournamentTeamEntries)
                .where((0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.id, entryId))
                .for('update')
                .limit(1);
            if (!entry)
                throw new common_1.NotFoundException('Đăng ký đội bóng không tồn tại.');
            if (entry.status === 'LOCKED')
                return entry;
            const snapshots = await tx
                .select({
                confirmationStatus: schema.tournamentTeamRosterSnapshots.confirmationStatus,
                role: schema.tournamentTeamRosterSnapshots.role,
            })
                .from(schema.tournamentTeamRosterSnapshots)
                .where((0, drizzle_orm_1.eq)(schema.tournamentTeamRosterSnapshots.entryId, entryId))
                .for('update');
            const [tournamentConfigRow] = await tx
                .select({ tournamentConfig: schema.tournaments.tournamentConfig })
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, entry.tournamentId))
                .limit(1);
            (0, football_roster_lock_1.assertFootballRosterLockable)({
                entryExists: true,
                entryStatus: entry.status,
                confirmations: snapshots.map((row) => row.confirmationStatus),
                mainRosterCount: snapshots.filter((row) => row.role === 'MAIN').length,
                requiredMainRosterCount: this.getRequiredFootballMainRosterCount(tournamentConfigRow?.tournamentConfig),
            });
            const [updated] = await tx
                .update(schema.tournamentTeamEntries)
                .set({ status: 'LOCKED', lockedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.tournamentTeamEntries.id, entryId))
                .returning();
            await this.auditService.logUpdate(tx, userId, 'tournament_team_entries', entryId, entry, updated);
            return updated;
        });
    }
    async findParticipantById(participantId) {
        const [participant] = await this.db
            .select()
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
            .limit(1);
        return participant;
    }
    async getParticipantRosters(participantId) {
        return this.db
            .select({
            userId: schema.tournamentRosters.userId,
            role: schema.tournamentRosters.role,
        })
            .from(schema.tournamentRosters)
            .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId));
    }
    async addRoster(participantId, userId, role, maxTeamSize) {
        return this.db.transaction(async (tx) => {
            const [participant] = await tx
                .select({
                id: schema.tournamentParticipants.id,
                rosterLockedAt: schema.tournamentParticipants.rosterLockedAt,
            })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .for('update')
                .limit(1);
            if (!participant)
                throw new common_1.NotFoundException('Đội thi đấu không tồn tại.');
            if (participant.rosterLockedAt) {
                throw new common_1.BadRequestException('Roster đội đã được khóa, không thể thêm thành viên.');
            }
            const existing = await tx
                .select({ id: schema.tournamentRosters.id })
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId), (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId)))
                .limit(1);
            if (existing.length > 0)
                throw new common_1.BadRequestException('Thành viên này đã có trong đội.');
            if (maxTeamSize !== undefined) {
                const [{ count }] = await tx
                    .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                    .from(schema.tournamentRosters)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId));
                if (Number(count) >= maxTeamSize)
                    throw new common_1.BadRequestException('Đội đã đạt số thành viên tối đa.');
            }
            const [row] = await tx
                .insert(schema.tournamentRosters)
                .values({ participantId, userId, role })
                .returning();
            return row;
        });
    }
    async removeRoster(participantId, userId) {
        return this.db.transaction(async (tx) => {
            const [participant] = await tx
                .select({
                id: schema.tournamentParticipants.id,
                rosterLockedAt: schema.tournamentParticipants.rosterLockedAt,
            })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
                .for('update')
                .limit(1);
            if (!participant)
                throw new common_1.NotFoundException('Đội thi đấu không tồn tại.');
            if (participant.rosterLockedAt) {
                throw new common_1.BadRequestException('Roster đội đã được khóa, không thể xóa thành viên.');
            }
            const deleted = await tx
                .delete(schema.tournamentRosters)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId), (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId)))
                .returning();
            if (deleted.length === 0)
                throw new common_1.BadRequestException('Không tìm thấy thành viên này trong đội.');
            return deleted[0];
        });
    }
    async findUserByEmailOrPhone(emailOrPhone) {
        const [user] = await this.db
            .select({ id: schema.users.id })
            .from(schema.users)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.users.email, emailOrPhone), (0, drizzle_orm_1.eq)(schema.profiles.phoneNumber, emailOrPhone)))
            .limit(1);
        return user;
    }
    async assignReservedSlot(tournamentId, userId, teamName, partnerId, divisionId) {
        return await this.db.transaction(async (tx) => {
            const tournament = await tx
                .select()
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .limit(1)
                .then((res) => res[0]);
            if (!tournament)
                throw new common_1.BadRequestException('Giải đấu không tồn tại');
            let divisionMatchType = tournament.matchType;
            if (divisionId) {
                const division = await tx
                    .select()
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, divisionId), (0, drizzle_orm_1.eq)(schema.tournamentDivisions.tournamentId, tournamentId)))
                    .limit(1)
                    .then((res) => res[0]);
                if (!division) {
                    throw new common_1.BadRequestException('Hình thức thi đấu không hợp lệ.');
                }
                divisionMatchType = division.matchType;
            }
            const isDoubles = divisionMatchType === 'DOUBLES' ||
                divisionMatchType === 'MIXED_DOUBLES';
            const teamStatus = isDoubles
                ? partnerId
                    ? 'COMPLETE'
                    : 'PENDING_PARTNER'
                : 'COMPLETE';
            const [participant] = await tx
                .insert(schema.tournamentParticipants)
                .values({
                tournamentId,
                tournamentDivisionId: divisionId ?? null,
                registeredBy: userId,
                teamName: teamName || 'Đội khách mời',
                isPaid: true,
                isWildcard: true,
                teamStatus,
            })
                .returning();
            await tx.insert(schema.tournamentRosters).values({
                participantId: participant.id,
                userId: userId,
                role: 'MAIN',
            });
            if (isDoubles && partnerId) {
                await tx.insert(schema.tournamentRosters).values({
                    participantId: participant.id,
                    userId: partnerId,
                    role: 'MAIN',
                });
            }
            return participant;
        });
    }
    async getUserElo(userId, categoryId, matchType) {
        const result = await this.db
            .select({ eloPoints: schema.userRanks.eloPoints })
            .from(schema.userRanks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userRanks.userId, userId), (0, drizzle_orm_1.eq)(schema.userRanks.categoryId, categoryId), (0, drizzle_orm_1.eq)(schema.userRanks.matchType, matchType), (0, drizzle_orm_1.sql) `${schema.userRanks.communityId} IS NULL`))
            .limit(1);
        return result[0]?.eloPoints ?? 1000;
    }
    async getUserEloInTx(tx, userId, categoryId, matchType) {
        const result = await tx
            .select({ eloPoints: schema.userRanks.eloPoints })
            .from(schema.userRanks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userRanks.userId, userId), (0, drizzle_orm_1.eq)(schema.userRanks.categoryId, categoryId), (0, drizzle_orm_1.eq)(schema.userRanks.matchType, matchType), (0, drizzle_orm_1.sql) `${schema.userRanks.communityId} IS NULL`))
            .limit(1);
        return result[0]?.eloPoints ?? 1000;
    }
    async findLeaderByParticipantId(participantId) {
        const result = await this.db
            .select()
            .from(schema.tournamentRosters)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId), (0, drizzle_orm_1.eq)(schema.tournamentRosters.role, 'MAIN')))
            .limit(1);
        return result[0] || null;
    }
    async cancelTournament(tournamentId) {
        return await this.db.transaction(async (tx) => {
            const [updatedTournament] = await tx
                .update(schema.tournaments)
                .set({ status: 'CANCELLED', updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .returning();
            const activeParticipants = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
            for (const participant of activeParticipants) {
                await this.invalidatePendingParticipantPayments(tx, tournamentId, participant.id, 'TOURNAMENT_CANCELLED');
                if (participant.isPaid) {
                    const entryFeeAmount = await this.resolveDivisionEntryFee(tx, updatedTournament, participant.tournamentDivisionId);
                    if (entryFeeAmount > 0) {
                        await tx
                            .update(schema.payments)
                            .set({
                            refundStatus: 'PENDING_REFUND',
                            refundedAmount: '0.00',
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.payments.participantId, participant.id), (0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED')));
                    }
                }
            }
            const stages = await tx
                .select({ id: schema.tournamentStages.id })
                .from(schema.tournamentStages)
                .where((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId));
            const stageIds = stages.map((s) => s.id);
            if (stageIds.length > 0) {
                const groups = await tx
                    .select({ id: schema.tournamentGroups.id })
                    .from(schema.tournamentGroups)
                    .where((0, drizzle_orm_1.inArray)(schema.tournamentGroups.stageId, stageIds));
                const groupIds = groups.map((g) => g.id);
                if (groupIds.length > 0) {
                    await tx
                        .update(schema.matches)
                        .set({ status: 'CANCELLED', updatedAt: new Date() })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.matches.groupId, groupIds), (0, drizzle_orm_1.ne)(schema.matches.status, 'COMPLETED'), (0, drizzle_orm_1.ne)(schema.matches.status, 'CANCELLED')));
                }
            }
            return updatedTournament;
        });
    }
    async getParentWithAggregation(parentId) {
        const children = await this.db
            .select({
            id: schema.tournaments.id,
            status: schema.tournaments.status,
        })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.parentId, parentId), (0, drizzle_orm_1.sql) `${schema.tournaments.deletedAt} IS NULL`));
        const participantCounts = await Promise.all(children.map(async (child) => {
            const [result] = await this.db
                .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, child.id), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
            return result?.count || 0;
        }));
        const totalParticipants = participantCounts.reduce((sum, c) => sum + c, 0);
        const statuses = children.map((c) => c.status);
        return {
            totalParticipants,
            divisionCount: children.length,
            statuses,
        };
    }
    async getFeesConfig() {
        const getVal = async (key, def) => {
            const [existing] = await this.db
                .select()
                .from(schema.systemConfigs)
                .where((0, drizzle_orm_1.eq)(schema.systemConfigs.key, key))
                .limit(1);
            return existing ? existing.value : def;
        };
        return {
            feePublicRanked: parseFloat(await getVal('TOURNAMENT_PUBLISH_FEE_PUBLIC_RANKED', '0')),
            feePublicUnranked: parseFloat(await getVal('TOURNAMENT_PUBLISH_FEE_PUBLIC_UNRANKED', '0')),
            feeClub: parseFloat(await getVal('TOURNAMENT_PUBLISH_FEE_CLUB', '0')),
            pctPublicRanked: parseFloat(await getVal('PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED', '5')),
            pctPublicUnranked: parseFloat(await getVal('PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED', '5')),
            pctClub: parseFloat(await getVal('PLATFORM_FEE_PERCENTAGE_CLUB', '0')),
            allowEntryFees: (await getVal('ALLOW_TOURNAMENT_ENTRY_FEES', 'true')).toLowerCase() ===
                'true',
        };
    }
    async cancelPendingRegistrationsIfFull(tournamentId) {
        return await this.db.transaction(async (tx) => {
            const [tournament] = await tx
                .select({
                maxParticipants: schema.tournaments.maxParticipants,
                entryFee: schema.tournaments.entryFee,
            })
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .limit(1);
            if (!tournament || !tournament.maxParticipants)
                return [];
            const [completedCount] = await tx
                .select({ count: (0, drizzle_orm_1.count)() })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isPaid, true)));
            if (completedCount.count >= tournament.maxParticipants) {
                const pendingParts = await tx
                    .select()
                    .from(schema.tournamentParticipants)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'PENDING_APPROVAL')));
                if (pendingParts.length === 0)
                    return [];
                const canceledLeaders = [];
                for (const p of pendingParts) {
                    await tx
                        .update(schema.tournamentParticipants)
                        .set({ teamStatus: 'KICKED', teamInviteToken: null })
                        .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, p.id));
                    await this.invalidatePendingParticipantPayments(tx, tournamentId, p.id, 'REGISTRATION_CANCELLED_TOURNAMENT_FULL');
                    const entryFeeAmount = await this.resolveDivisionEntryFee(tx, tournament, p.tournamentDivisionId);
                    if (entryFeeAmount > 0 && p.isPaid) {
                        await tx
                            .update(schema.payments)
                            .set({
                            refundStatus: 'PENDING_REFUND',
                            refundedAmount: '0.00',
                        })
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.payments.participantId, p.id), (0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED')));
                    }
                    canceledLeaders.push({
                        leaderId: p.registeredBy,
                        divisionId: p.tournamentDivisionId,
                    });
                }
                return canceledLeaders;
            }
            return [];
        });
    }
    async processPendingRegistrationsTimeout() {
        return await this.db.transaction(async (tx) => {
            const timeoutThreshold = new Date(Date.now() - 30 * 60 * 1000);
            const expiredParts = await tx
                .select({
                participant: schema.tournamentParticipants,
                tournament: schema.tournaments,
            })
                .from(schema.tournamentParticipants)
                .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, schema.tournaments.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'PENDING_PARTNER'), (0, drizzle_orm_1.lt)(schema.tournamentParticipants.registeredAt, timeoutThreshold)));
            if (expiredParts.length === 0)
                return [];
            const results = [];
            for (const { participant, tournament } of expiredParts) {
                await tx
                    .update(schema.tournamentParticipants)
                    .set({ teamStatus: 'KICKED', teamInviteToken: null })
                    .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participant.id));
                await this.invalidatePendingParticipantPayments(tx, tournament.id, participant.id, 'PARTNER_JOIN_TIMEOUT');
                const entryFeeAmount = await this.resolveDivisionEntryFee(tx, tournament, participant.tournamentDivisionId);
                if (entryFeeAmount > 0 && participant.isPaid) {
                    await tx
                        .update(schema.payments)
                        .set({
                        refundStatus: 'PENDING_REFUND',
                        refundedAmount: '0.00',
                    })
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournament.id), (0, drizzle_orm_1.eq)(schema.payments.participantId, participant.id), (0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED')));
                }
                results.push({
                    leaderId: participant.registeredBy,
                    tournamentId: tournament.id,
                    tournamentName: tournament.name,
                    divisionId: participant.tournamentDivisionId,
                });
            }
            return results;
        });
    }
    async promoteNextWaitlisted(tx, tournamentId, divisionId) {
        const divisionFilter = divisionId
            ? (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId)
            : undefined;
        const [nextWaitlisted] = await tx
            .select()
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'WAITLISTED'), ...(divisionFilter ? [divisionFilter] : [])))
            .orderBy((0, drizzle_orm_1.asc)(schema.tournamentParticipants.registeredAt))
            .limit(1);
        if (nextWaitlisted) {
            const [tournament] = await tx
                .select({
                matchType: schema.tournaments.matchType,
                entryFee: schema.tournaments.entryFee,
                tournamentConfig: schema.tournaments.tournamentConfig,
            })
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .limit(1);
            const [division] = nextWaitlisted.tournamentDivisionId
                ? await tx
                    .select({ matchType: schema.tournamentDivisions.matchType })
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, nextWaitlisted.tournamentDivisionId))
                    .limit(1)
                : [null];
            const [rosterCount] = await tx
                .select({ count: (0, drizzle_orm_1.count)() })
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, nextWaitlisted.id));
            const matchType = division?.matchType ?? tournament?.matchType ?? null;
            const isDoubles = this.isDoublesMatchType(matchType);
            const entryFeeAmount = await this.resolveDivisionEntryFee(tx, { entryFee: tournament?.entryFee ?? null }, nextWaitlisted.tournamentDivisionId);
            const promotionConfig = (tournament?.tournamentConfig || {});
            const regMode = promotionConfig.isLite === true
                ? 'OPEN'
                : promotionConfig.registrationMode === 'APPROVAL'
                    ? 'APPROVAL'
                    : 'OPEN';
            const promotedStatus = isDoubles && Number(rosterCount.count) < 2
                ? 'PENDING_PARTNER'
                : regMode === 'APPROVAL'
                    ? 'PENDING_APPROVAL'
                    : 'COMPLETE';
            const [promoted] = await tx
                .update(schema.tournamentParticipants)
                .set({
                teamStatus: promotedStatus,
                isPaid: nextWaitlisted.isPaid || entryFeeAmount === 0,
            })
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, nextWaitlisted.id))
                .returning();
            return promoted;
        }
        return null;
    }
    async findReferees(tournamentId) {
        return this.db
            .select({
            id: schema.tournamentReferees.id,
            userId: schema.tournamentReferees.userId,
            status: schema.tournamentReferees.status,
            fullName: schema.profiles.fullName,
            email: schema.users.email,
            avatarUrl: schema.profiles.avatarUrl,
        })
            .from(schema.tournamentReferees)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.tournamentReferees.userId, schema.users.id))
            .innerJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.tournamentReferees.tournamentId, tournamentId));
    }
    async addStaffMember(tournamentId, userId, role, createdBy) {
        const [existing] = await this.db
            .select()
            .from(schema.tournamentStaff)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStaff.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStaff.userId, userId)))
            .limit(1);
        if (existing) {
            const [updated] = await this.db
                .update(schema.tournamentStaff)
                .set({ role })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStaff.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStaff.userId, userId)))
                .returning();
            return updated ?? existing;
        }
        const [record] = await this.db
            .insert(schema.tournamentStaff)
            .values({ tournamentId, userId, role, createdBy })
            .returning();
        return record;
    }
    async removeStaffMember(tournamentId, userId) {
        const [record] = await this.db
            .delete(schema.tournamentStaff)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStaff.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStaff.userId, userId)))
            .returning();
        return record;
    }
    async isCoOrganizer(tournamentId, userId) {
        const [row] = await this.db
            .select({ id: schema.tournamentStaff.id })
            .from(schema.tournamentStaff)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStaff.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStaff.userId, userId), (0, drizzle_orm_1.eq)(schema.tournamentStaff.role, 'CO_ORGANIZER')))
            .limit(1);
        return Boolean(row);
    }
    async findStaffByTournament(tournamentId, role) {
        const conditions = [
            (0, drizzle_orm_1.eq)(schema.tournamentStaff.tournamentId, tournamentId),
        ];
        if (role)
            conditions.push((0, drizzle_orm_1.eq)(schema.tournamentStaff.role, role));
        const rows = await this.db
            .select({
            userId: schema.tournamentStaff.userId,
            role: schema.tournamentStaff.role,
            fullName: schema.profiles.fullName,
            email: schema.users.email,
            avatarUrl: schema.profiles.avatarUrl,
        })
            .from(schema.tournamentStaff)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.tournamentStaff.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)(...conditions));
        return rows.map((row) => ({
            ...row,
            fullName: row.fullName || row.email,
            avatarUrl: row.avatarUrl || null,
        }));
    }
    async findParticipantsForSeeding(tournamentId, divisionId) {
        const participants = await this.db
            .select()
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), divisionId
            ? (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId)
            : undefined, (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isPaid, true)))));
        const participantIds = participants.map((p) => p.id);
        const rosters = await this.db
            .select()
            .from(schema.tournamentRosters)
            .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, participantIds));
        const rosterMap = new Map();
        for (const r of rosters) {
            const list = rosterMap.get(r.participantId) || [];
            list.push(r);
            rosterMap.set(r.participantId, list);
        }
        return participants.map((p) => ({
            ...p,
            members: rosterMap.get(p.id) || [],
        }));
    }
    async updateSeeds(tournamentId, seeds) {
        return await this.db.transaction(async (tx) => {
            for (const item of seeds) {
                await tx
                    .update(schema.tournamentParticipants)
                    .set({ seed: item.seed })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, item.participantId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId)));
            }
            return { success: true };
        });
    }
    async getDivisionsByTournament(tournamentId) {
        try {
            const divisions = await this.db
                .select()
                .from(schema.tournamentDivisions)
                .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.tournamentId, tournamentId))
                .orderBy(schema.tournamentDivisions.createdAt);
            return await Promise.all(divisions.map(async (division) => {
                const [participantCountByDivision] = await this.db
                    .select({ count: (0, drizzle_orm_1.count)() })
                    .from(schema.tournamentParticipants)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, division.id), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
                return {
                    ...division,
                    _count: {
                        participants: participantCountByDivision.count,
                    },
                };
            }));
        }
        catch (error) {
            console.error(`Failed to get divisions for tournament ${tournamentId}:`, error);
            throw error;
        }
    }
    async findDivisionById(id) {
        try {
            const [division] = await this.db
                .select()
                .from(schema.tournamentDivisions)
                .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, id))
                .limit(1);
            return division ?? null;
        }
        catch (error) {
            console.error(`Failed to get division ${id}:`, error);
            throw error;
        }
    }
    async createDivision(division, userId) {
        try {
            return await this.db.transaction(async (tx) => {
                try {
                    const [created] = await tx
                        .insert(schema.tournamentDivisions)
                        .values({
                        tournamentId: division.tournamentId,
                        name: division.name,
                        matchType: division.matchType,
                        genderRestriction: division.genderRestriction || null,
                        maxParticipants: division.maxParticipants || null,
                        entryFee: (division.entryFee ?? 0).toString(),
                        isConfigOverride: division.isConfigOverride ?? false,
                        venueId: division.venueId ?? null,
                        bracketType: division.bracketType ?? null,
                        roundConfig: division.roundConfig ?? null,
                        startDate: division.startDate
                            ? new Date(division.startDate)
                            : null,
                        registrationEndDate: division.registrationEndDate
                            ? new Date(division.registrationEndDate)
                            : null,
                        minElo: division.minElo ?? null,
                        maxElo: division.maxElo ?? null,
                        prizeDescription: division.prizeDescription ?? null,
                        status: 'DRAFT',
                    })
                        .returning();
                    await this.auditService.logCreate(tx, userId, 'tournament_divisions', created.id, created);
                    return created;
                }
                catch (txError) {
                    console.error('🔴 Transaction error details:', txError);
                    throw txError;
                }
            });
        }
        catch (error) {
            console.error('Failed to create division:', error);
            throw error;
        }
    }
    async updateDivision(id, dto, userId) {
        try {
            return await this.db.transaction(async (tx) => {
                const [oldRecord] = await tx
                    .select()
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, id))
                    .limit(1);
                if (!oldRecord) {
                    throw new common_1.NotFoundException('Không tìm thấy nội dung thi đấu');
                }
                const mergedRoundConfig = dto.roundConfig === undefined
                    ? undefined
                    : this.mergeRoundConfig(oldRecord.roundConfig, dto.roundConfig);
                const [updated] = await tx
                    .update(schema.tournamentDivisions)
                    .set({
                    ...(dto.name && { name: dto.name }),
                    ...(dto.matchType && { matchType: dto.matchType }),
                    ...(dto.genderRestriction !== undefined && {
                        genderRestriction: dto.genderRestriction,
                    }),
                    ...(dto.maxParticipants !== undefined && {
                        maxParticipants: dto.maxParticipants,
                    }),
                    ...(dto.entryFee !== undefined && {
                        entryFee: dto.entryFee.toString(),
                    }),
                    ...(dto.status && { status: dto.status }),
                    ...(dto.isConfigOverride !== undefined && {
                        isConfigOverride: dto.isConfigOverride,
                    }),
                    ...(dto.venueId !== undefined && { venueId: dto.venueId }),
                    ...(dto.bracketType !== undefined && {
                        bracketType: dto.bracketType,
                    }),
                    ...(mergedRoundConfig !== undefined && {
                        roundConfig: mergedRoundConfig,
                    }),
                    ...(dto.startDate !== undefined && {
                        startDate: dto.startDate ? new Date(dto.startDate) : null,
                    }),
                    ...(dto.registrationEndDate !== undefined && {
                        registrationEndDate: dto.registrationEndDate
                            ? new Date(dto.registrationEndDate)
                            : null,
                    }),
                    ...(dto.minElo !== undefined && { minElo: dto.minElo }),
                    ...(dto.maxElo !== undefined && { maxElo: dto.maxElo }),
                    ...(dto.prizeDescription !== undefined && {
                        prizeDescription: dto.prizeDescription,
                    }),
                })
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, id))
                    .returning();
                await this.auditService.logUpdate(tx, userId, 'tournament_divisions', id, oldRecord, updated);
                return updated;
            });
        }
        catch (error) {
            console.error(`Failed to update division ${id}:`, error);
            throw error;
        }
    }
    async deleteDivision(id, userId) {
        try {
            return await this.db.transaction(async (tx) => {
                const [oldRecord] = await tx
                    .select()
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, id))
                    .limit(1);
                if (!oldRecord) {
                    throw new common_1.NotFoundException('Không tìm thấy nội dung thi đấu');
                }
                const [{ value: remainingDivisions }] = await tx
                    .select({ value: (0, drizzle_orm_1.count)() })
                    .from(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.tournamentId, oldRecord.tournamentId));
                if (remainingDivisions <= 1) {
                    throw new common_1.BadRequestException('Phải có ít nhất 1 hình thức thi đấu. Hãy xóa cả giải đấu nếu không cần.');
                }
                const [{ value: activeParticipants }] = await tx
                    .select({ value: (0, drizzle_orm_1.count)() })
                    .from(schema.tournamentParticipants)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, id), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, false), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
                if (activeParticipants > 0) {
                    throw new common_1.BadRequestException('Không thể xóa hình thức đang có người chơi thật. Hãy di chuyển hoặc loại bỏ người chơi thật trước.');
                }
                const mockParticipants = await tx
                    .select({ id: schema.tournamentParticipants.id })
                    .from(schema.tournamentParticipants)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, id), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isMock, true)));
                const mockParticipantIds = mockParticipants.map((participant) => participant.id);
                const mockRosterUsers = mockParticipantIds.length > 0
                    ? await tx
                        .select({ userId: schema.tournamentRosters.userId })
                        .from(schema.tournamentRosters)
                        .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, mockParticipantIds))
                    : [];
                await tx
                    .delete(schema.tournamentDivisions)
                    .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, id));
                const mockUserIds = Array.from(new Set(mockRosterUsers.map((roster) => roster.userId)));
                if (mockUserIds.length > 0) {
                    const remainingRosterUsers = await tx
                        .select({ userId: schema.tournamentRosters.userId })
                        .from(schema.tournamentRosters)
                        .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.userId, mockUserIds));
                    const remainingRegistrants = await tx
                        .select({ userId: schema.tournamentParticipants.registeredBy })
                        .from(schema.tournamentParticipants)
                        .where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.registeredBy, mockUserIds));
                    const referencedUserIds = new Set([
                        ...remainingRosterUsers.map((row) => row.userId),
                        ...remainingRegistrants.map((row) => row.userId),
                    ]);
                    const orphanMockUserIds = mockUserIds.filter((mockUserId) => !referencedUserIds.has(mockUserId));
                    if (orphanMockUserIds.length > 0) {
                        await tx
                            .delete(schema.profiles)
                            .where((0, drizzle_orm_1.inArray)(schema.profiles.userId, orphanMockUserIds));
                        await tx
                            .delete(schema.users)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.users.id, orphanMockUserIds), (0, drizzle_orm_1.eq)(schema.users.isMock, true)));
                    }
                }
                await this.auditService.logDelete(tx, userId, 'tournament_divisions', id, oldRecord);
                return {
                    success: true,
                    removedMockParticipants: mockParticipantIds.length,
                };
            });
        }
        catch (error) {
            console.error(`Failed to delete division ${id}:`, error);
            throw error;
        }
    }
    async updateDivisionConfig(id, dto, userId) {
        return this.updateDivision(id, { ...dto, isConfigOverride: dto.isConfigOverride ?? true }, userId);
    }
    async getParticipantsByDivision(divisionId) {
        try {
            return await this.db
                .select({
                id: schema.tournamentParticipants.id,
                teamName: schema.tournamentParticipants.teamName,
                seed: schema.tournamentParticipants.seed,
                isPaid: schema.tournamentParticipants.isPaid,
                registeredAt: schema.tournamentParticipants.registeredAt,
                registeredBy: {
                    id: schema.users.id,
                    fullName: schema.profiles.fullName,
                    avatarUrl: schema.profiles.avatarUrl,
                },
            })
                .from(schema.tournamentParticipants)
                .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.tournamentParticipants.registeredBy, schema.users.id))
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentDivisionId, divisionId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN')));
        }
        catch (error) {
            console.error(`Failed to get participants for division ${divisionId}:`, error);
            throw error;
        }
    }
    async findUserByEmail(email) {
        const [user] = await this.db
            .select()
            .from(schema.users)
            .where((0, drizzle_orm_1.eq)(schema.users.email, email))
            .limit(1);
        return user;
    }
    async findUserBasicById(userId) {
        const [user] = await this.db
            .select({
            id: schema.users.id,
            fullName: schema.profiles.fullName,
            email: schema.users.email,
        })
            .from(schema.users)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.users.id, userId))
            .limit(1);
        return user || null;
    }
    async addReferee(tournamentId, userId, assignedBy) {
        const [existing] = await this.db
            .select()
            .from(schema.tournamentReferees)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentReferees.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentReferees.userId, userId)))
            .limit(1);
        if (existing) {
            if (existing.status !== 'INVITED') {
                await this.db
                    .update(schema.tournamentReferees)
                    .set({ status: 'INVITED', assignedBy, assignedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(schema.tournamentReferees.id, existing.id));
                return {
                    ...existing,
                    status: 'INVITED',
                    assignedBy,
                    assignedAt: new Date(),
                };
            }
            return existing;
        }
        const [referee] = await this.db
            .insert(schema.tournamentReferees)
            .values({
            tournamentId,
            userId,
            assignedBy,
            status: 'INVITED',
        })
            .returning();
        return referee;
    }
    async findRefereeById(refereeId) {
        const [ref] = await this.db
            .select()
            .from(schema.tournamentReferees)
            .where((0, drizzle_orm_1.eq)(schema.tournamentReferees.id, refereeId))
            .limit(1);
        return ref || null;
    }
    async findRefereeByTournamentAndUser(tournamentId, userId) {
        const [referee] = await this.db
            .select()
            .from(schema.tournamentReferees)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentReferees.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentReferees.userId, userId)))
            .limit(1);
        return referee || null;
    }
    async updateRefereeStatus(refereeId, status) {
        const [updated] = await this.db
            .update(schema.tournamentReferees)
            .set({ status, assignedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.tournamentReferees.id, refereeId))
            .returning();
        return updated;
    }
    async removeRefereeInvite(refereeId) {
        const [removed] = await this.db
            .delete(schema.tournamentReferees)
            .where((0, drizzle_orm_1.eq)(schema.tournamentReferees.id, refereeId))
            .returning();
        return removed || null;
    }
    async cancelScheduledMatchesInStage(stageId) {
        const result = await this.db
            .update(schema.matches)
            .set({ status: 'CANCELLED', updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.stageId, stageId), (0, drizzle_orm_1.ne)(schema.matches.status, 'COMPLETED')));
        return result;
    }
    async getGroupByStageId(stageId) {
        const [group] = await this.db
            .select()
            .from(schema.tournamentGroups)
            .where((0, drizzle_orm_1.eq)(schema.tournamentGroups.stageId, stageId))
            .limit(1);
        return group || null;
    }
    async createPlayoffMatch(data) {
        const { randomUUID } = await import('crypto');
        const [match] = await this.db
            .insert(schema.matches)
            .values({
            id: randomUUID(),
            tournamentId: data.tournamentId,
            stageId: data.stageId,
            groupId: data.groupId,
            participant1Id: data.participant1Id,
            participant2Id: data.participant2Id,
            roundNumber: data.roundNumber,
            matchOrder: data.matchOrder,
            bracketBranch: 'PLAYOFF',
            status: 'SCHEDULED',
            isBye: false,
            p1SetsWon: 0,
            p2SetsWon: 0,
            totalSetsPlayed: 0,
            nextMatchId: null,
            loserNextMatchId: null,
            winnerId: null,
            updatedAt: new Date(),
        })
            .returning();
        return match;
    }
    async getMaxRoundAndMatchOrder(stageId) {
        const result = await this.db
            .select({
            maxRound: (0, drizzle_orm_1.sql) `COALESCE(MAX(${schema.matches.roundNumber}), 0)`,
            maxOrder: (0, drizzle_orm_1.sql) `COALESCE(MAX(${schema.matches.matchOrder}), 0)`,
        })
            .from(schema.matches)
            .where((0, drizzle_orm_1.eq)(schema.matches.stageId, stageId));
        return result[0] || { maxRound: 0, maxOrder: 0 };
    }
    async followTournament(tournamentId, userId) {
        const [existing] = await this.db
            .select()
            .from(schema.tournamentFollows)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentFollows.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentFollows.userId, userId)))
            .limit(1);
        if (existing)
            return existing;
        const [follow] = await this.db
            .insert(schema.tournamentFollows)
            .values({ tournamentId, userId })
            .returning();
        return follow;
    }
    async unfollowTournament(tournamentId, userId) {
        await this.db
            .delete(schema.tournamentFollows)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentFollows.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentFollows.userId, userId)));
    }
    async getFollowedTournamentIds(userId) {
        const rows = await this.db
            .select({ tournamentId: schema.tournamentFollows.tournamentId })
            .from(schema.tournamentFollows)
            .where((0, drizzle_orm_1.eq)(schema.tournamentFollows.userId, userId));
        return rows.map((r) => r.tournamentId);
    }
    async getFollowerUserIds(tournamentId) {
        const rows = await this.db
            .select({ userId: schema.tournamentFollows.userId })
            .from(schema.tournamentFollows)
            .where((0, drizzle_orm_1.eq)(schema.tournamentFollows.tournamentId, tournamentId));
        return rows.map((r) => r.userId);
    }
    async getFollowedTournaments(userId) {
        return this.db
            .select()
            .from(schema.tournamentFollows)
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentFollows.tournamentId, schema.tournaments.id))
            .where((0, drizzle_orm_1.eq)(schema.tournamentFollows.userId, userId));
    }
    async countLiteActiveRosterUsers(tournamentId) {
        const [result] = await this.db
            .select({
            count: (0, drizzle_orm_1.sql) `count(distinct ${schema.tournamentRosters.userId})`,
        })
            .from(schema.tournamentRosters)
            .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED')));
        return Number(result?.count ?? 0);
    }
    async findLiteParticipantsWithRosters(tournamentId) {
        const participants = await this.db
            .select()
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED')))
            .orderBy(schema.tournamentParticipants.registeredAt);
        const pIds = participants.map((p) => p.id);
        const rosters = pIds.length > 0
            ? await this.db
                .select()
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, pIds))
            : [];
        const rosterMap = new Map();
        for (const r of rosters) {
            const list = rosterMap.get(r.participantId) || [];
            list.push(r);
            rosterMap.set(r.participantId, list);
        }
        const userIds = [...new Set(rosters.map((r) => r.userId))];
        const profiles = userIds.length > 0
            ? await this.db
                .select({
                userId: schema.profiles.userId,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            })
                .from(schema.profiles)
                .where((0, drizzle_orm_1.inArray)(schema.profiles.userId, userIds))
            : [];
        const profileMap = new Map(profiles.map((p) => [p.userId, p]));
        return participants.map((p) => ({
            ...p,
            rosters: (rosterMap.get(p.id) || []).map((r) => ({
                ...r,
                profile: profileMap.get(r.userId) || null,
            })),
        }));
    }
    async findLitePendingPartnerParticipants(tournamentId) {
        const allParticipants = await this.findLiteParticipantsWithRosters(tournamentId);
        return allParticipants.filter((p) => p.teamStatus === 'PENDING_PARTNER' && (p.rosters?.length ?? 0) === 1);
    }
    async hasNonDeletedStagesOrMatches(tournamentId) {
        const [stageCount] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.tournamentStages)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.isNull)(schema.tournamentStages.deletedAt)));
        if (stageCount.count > 0)
            return true;
        const [matchCount] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.matches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, tournamentId), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)));
        return matchCount.count > 0;
    }
    async pairLiteParticipantsInTx(tx, tournamentId, p1Id, p2Id, userId, registrationMode, teamName) {
        const sortedIds = [p1Id, p2Id].sort();
        const lockedRows = {};
        for (const id of sortedIds) {
            const [p] = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, id))
                .limit(1)
                .for('update');
            if (!p || p.tournamentId !== tournamentId) {
                throw new common_1.BadRequestException(`Participant ${id} không hợp lệ`);
            }
            lockedRows[id] = p;
        }
        const p1 = lockedRows[p1Id];
        const p2 = lockedRows[p2Id];
        if (p1Id === p2Id) {
            throw new common_1.BadRequestException('Không thể ghép cặp với chính mình');
        }
        if ((p1.teamStatus === 'COMPLETE' || p1.teamStatus === 'PENDING_APPROVAL') &&
            p2.teamStatus === 'WITHDRAWN') {
            const p1RostersCheck = await tx
                .select()
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, p1Id));
            if (p1RostersCheck.length === 2) {
                const p2UserInP1 = p1RostersCheck.some((r) => r.userId === p2.registeredBy);
                if (p2UserInP1) {
                    return p1;
                }
            }
        }
        if (p1.teamStatus !== 'PENDING_PARTNER') {
            throw new common_1.BadRequestException(`Participant 1 đang ở trạng thái ${p1.teamStatus}, không thể ghép cặp`);
        }
        if (p2.teamStatus !== 'PENDING_PARTNER') {
            throw new common_1.BadRequestException(`Participant 2 đang ở trạng thái ${p2.teamStatus}, không thể ghép cặp`);
        }
        const p1Rosters = await tx
            .select()
            .from(schema.tournamentRosters)
            .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, p1Id));
        const p2Rosters = await tx
            .select()
            .from(schema.tournamentRosters)
            .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, p2Id));
        if (p1Rosters.length !== 1) {
            throw new common_1.BadRequestException('Participant 1 phải có đúng 1 thành viên');
        }
        if (p2Rosters.length !== 1) {
            throw new common_1.BadRequestException('Participant 2 phải có đúng 1 thành viên');
        }
        const p2UserId = p2Rosters[0].userId;
        const allRostersCheck = await tx
            .select({ userId: schema.tournamentRosters.userId })
            .from(schema.tournamentRosters)
            .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'REJECTED'), (0, drizzle_orm_1.ne)(schema.tournamentParticipants.teamStatus, 'KICKED'), (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, p2UserId), (0, drizzle_orm_1.ne)(schema.tournamentRosters.participantId, p2Id)));
        if (allRostersCheck.length > 0) {
            throw new common_1.BadRequestException('Thành viên của Participant 2 đã tham gia đội khác trong giải này');
        }
        const p2Roster = p2Rosters[0];
        await tx
            .update(schema.tournamentRosters)
            .set({ participantId: p1Id })
            .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.id, p2Roster.id));
        const targetStatus = 'COMPLETE';
        const [updatedP1] = await tx
            .update(schema.tournamentParticipants)
            .set({
            teamStatus: targetStatus,
            isPaid: true,
            teamInviteToken: null,
            teamName,
        })
            .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, p1Id))
            .returning();
        const [updatedP2] = await tx
            .update(schema.tournamentParticipants)
            .set({
            teamStatus: 'WITHDRAWN',
            teamInviteToken: null,
        })
            .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, p2Id))
            .returning();
        await this.auditService.logUpdate(tx, userId, 'tournament_participants', p1Id, p1, updatedP1);
        await this.auditService.logUpdate(tx, userId, 'tournament_participants', p2Id, p2, updatedP2);
        return updatedP1;
    }
    async unpairParticipantInTx(tx, tournamentId, participantId, userId) {
        const [participant] = await tx
            .select()
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
            .limit(1)
            .for('update');
        if (!participant || participant.tournamentId !== tournamentId) {
            throw new common_1.BadRequestException('Participant không hợp lệ');
        }
        if (participant.teamStatus !== 'COMPLETE' &&
            participant.teamStatus !== 'PENDING_APPROVAL') {
            throw new common_1.BadRequestException(`Không thể tách cặp participant ở trạng thái ${participant.teamStatus}`);
        }
        const rosters = await tx
            .select()
            .from(schema.tournamentRosters)
            .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId));
        if (rosters.length !== 2) {
            throw new common_1.BadRequestException('Participant phải có đúng 2 thành viên để tách cặp');
        }
        const leaderRoster = rosters.find((r) => r.userId === participant.registeredBy);
        const partnerRoster = rosters.find((r) => r.userId !== participant.registeredBy);
        if (!leaderRoster || !partnerRoster) {
            throw new common_1.BadRequestException('Không thể xác định đội trưởng — lỗi dữ liệu.');
        }
        const leaderToken = crypto
            .randomUUID()
            .replace(/-/g, '')
            .substring(0, 12)
            .toUpperCase();
        const partnerToken = crypto
            .randomUUID()
            .replace(/-/g, '')
            .substring(0, 12)
            .toUpperCase();
        const [leaderProfile] = await tx
            .select({ fullName: schema.profiles.fullName })
            .from(schema.profiles)
            .where((0, drizzle_orm_1.eq)(schema.profiles.userId, leaderRoster.userId))
            .limit(1);
        const [partnerProfile] = await tx
            .select({ fullName: schema.profiles.fullName })
            .from(schema.profiles)
            .where((0, drizzle_orm_1.eq)(schema.profiles.userId, partnerRoster.userId))
            .limit(1);
        const [newParticipant] = await tx
            .insert(schema.tournamentParticipants)
            .values({
            tournamentId,
            tournamentDivisionId: participant.tournamentDivisionId,
            registeredBy: partnerRoster.userId,
            teamName: partnerProfile?.fullName || 'Vận động viên',
            isPaid: true,
            teamInviteToken: partnerToken,
            teamStatus: 'PENDING_PARTNER',
        })
            .returning();
        await tx
            .update(schema.tournamentRosters)
            .set({ participantId: newParticipant.id })
            .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.id, partnerRoster.id));
        const [updatedOriginal] = await tx
            .update(schema.tournamentParticipants)
            .set({
            teamStatus: 'PENDING_PARTNER',
            isPaid: true,
            teamInviteToken: leaderToken,
            teamName: leaderProfile?.fullName || 'Vận động viên',
        })
            .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, participantId))
            .returning();
        await this.auditService.logCreate(tx, userId, 'tournament_participants', newParticipant.id, newParticipant);
        await this.auditService.logUpdate(tx, userId, 'tournament_participants', participantId, participant, updatedOriginal);
        return { leader: updatedOriginal, partner: newParticipant };
    }
    async assertLitePairableInTx(tx, tournamentId) {
        const [tournament] = await tx
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .limit(1)
            .for('update');
        if (!tournament)
            throw new common_1.BadRequestException('Giải đấu không tồn tại');
        const tCfg = (tournament.tournamentConfig || {});
        if (tCfg.isLite !== true) {
            throw new common_1.BadRequestException('Thao tác này chỉ hỗ trợ giải đấu Lite.');
        }
        if (tournament.matchType !== 'DOUBLES' &&
            tournament.matchType !== 'MIXED_DOUBLES') {
            throw new common_1.BadRequestException('Ghép cặp chỉ hỗ trợ giải đấu đánh đôi.');
        }
        const [stageCount] = await tx
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.tournamentStages)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.isNull)(schema.tournamentStages.deletedAt)));
        if (stageCount.count > 0) {
            throw new common_1.BadRequestException('Không thể ghép cặp sau khi đã sinh nhánh đấu.');
        }
        const [matchCount] = await tx
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.matches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, tournamentId), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)));
        if (matchCount.count > 0) {
            throw new common_1.BadRequestException('Không thể ghép cặp sau khi đã sinh trận đấu.');
        }
        return tournament;
    }
    async lockTournamentAndPair(tournamentId, p1Id, p2Id, userId, registrationMode, teamName) {
        return await this.db.transaction(async (tx) => {
            await this.assertLitePairableInTx(tx, tournamentId);
            return this.pairLiteParticipantsInTx(tx, tournamentId, p1Id, p2Id, userId, registrationMode, teamName);
        });
    }
    async lockTournamentAndUnpair(tournamentId, participantId, userId) {
        return await this.db.transaction(async (tx) => {
            await this.assertLitePairableInTx(tx, tournamentId);
            return this.unpairParticipantInTx(tx, tournamentId, participantId, userId);
        });
    }
    async generateLitePairsTx(tournamentId, userId, strategy) {
        return await this.db.transaction(async (tx) => {
            const tournament = await this.assertLitePairableInTx(tx, tournamentId);
            const rawRegistrationMode = (tournament.tournamentConfig || {})
                .registrationMode || 'OPEN';
            const registrationMode = rawRegistrationMode === 'APPROVAL'
                ? 'OPEN'
                : rawRegistrationMode;
            const pendingParticipants = await tx
                .select()
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'PENDING_PARTNER')))
                .for('update')
                .orderBy(schema.tournamentParticipants.id);
            const pIds = pendingParticipants.map((p) => p.id);
            const allRosters = pIds.length > 0
                ? await tx
                    .select()
                    .from(schema.tournamentRosters)
                    .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, pIds))
                : [];
            const rosterMap = new Map();
            for (const r of allRosters) {
                const list = rosterMap.get(r.participantId) || [];
                list.push(r);
                rosterMap.set(r.participantId, list);
            }
            const userIds = [...new Set(allRosters.map((r) => r.userId))];
            const profiles = userIds.length > 0
                ? await tx
                    .select({
                    userId: schema.profiles.userId,
                    fullName: schema.profiles.fullName,
                })
                    .from(schema.profiles)
                    .where((0, drizzle_orm_1.inArray)(schema.profiles.userId, userIds))
                : [];
            const profileMap = new Map(profiles.map((p) => [p.userId, p]));
            const pending = pendingParticipants
                .filter((p) => (rosterMap.get(p.id)?.length ?? 0) === 1)
                .map((p) => ({
                ...p,
                rosters: (rosterMap.get(p.id) || []).map((r) => ({
                    ...r,
                    profile: profileMap.get(r.userId) || null,
                })),
            }));
            if (pending.length < 2) {
                throw new common_1.BadRequestException('Cần ít nhất 2 người chơi đang chờ ghép cặp.');
            }
            let ordered = [...pending];
            if (strategy === 'RANDOM') {
                for (let i = ordered.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
                }
            }
            else {
                const eloEntries = await Promise.all(ordered.map(async (p) => {
                    const rosterUser = p.rosters?.[0];
                    const elo = rosterUser?.userId
                        ? await this.getUserEloInTx(tx, rosterUser.userId, tournament.categoryId, tournament.matchType)
                        : 1000;
                    return { participant: p, elo };
                }));
                eloEntries.sort((a, b) => b.elo - a.elo);
                ordered = eloEntries.map((e) => e.participant);
                const reordered = [];
                let left = 0;
                let right = ordered.length - 1;
                while (left <= right) {
                    if (left !== right) {
                        reordered.push(ordered[left]);
                        reordered.push(ordered[right]);
                    }
                    else {
                        reordered.push(ordered[left]);
                    }
                    left++;
                    right--;
                }
                ordered = reordered;
            }
            const paired = [];
            const unpairedIds = [];
            for (let i = 0; i < ordered.length; i += 2) {
                if (i + 1 >= ordered.length) {
                    unpairedIds.push(ordered[i].id);
                    break;
                }
                const p1 = ordered[i];
                const p2 = ordered[i + 1];
                const p1User = p1.rosters?.[0]?.userId;
                const p2User = p2.rosters?.[0]?.userId;
                const p1Profile = p1User ? profileMap.get(p1User) : null;
                const p2Profile = p2User ? profileMap.get(p2User) : null;
                const p1Name = p1Profile?.fullName || 'VĐV';
                const p2Name = p2Profile?.fullName || 'VĐV';
                const teamName = `${p1Name} / ${p2Name}`;
                await this.pairLiteParticipantsInTx(tx, tournamentId, p1.id, p2.id, userId, registrationMode, teamName);
                paired.push({ participant1Id: p1.id, participant2Id: p2.id, teamName });
            }
            return {
                message: `Đã ghép ${paired.length} cặp thành công.`,
                paired,
                unpairedParticipantIds: unpairedIds,
                strategy,
            };
        });
    }
    async findGroupStandings(tournamentId, divisionId) {
        const stages = await this.db
            .select()
            .from(schema.tournamentStages)
            .where(divisionId
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId), (0, drizzle_orm_1.eq)(schema.tournamentStages.type, 'ROUND_ROBIN'), (0, drizzle_orm_1.isNull)(schema.tournamentStages.deletedAt))
            : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStages.type, 'ROUND_ROBIN'), (0, drizzle_orm_1.isNull)(schema.tournamentStages.deletedAt)))
            .orderBy(schema.tournamentStages.order);
        if (stages.length === 0)
            return [];
        const stageIds = stages.map((s) => s.id);
        const groups = await this.db
            .select()
            .from(schema.tournamentGroups)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.tournamentGroups.stageId, stageIds), (0, drizzle_orm_1.isNull)(schema.tournamentGroups.deletedAt)))
            .orderBy(schema.tournamentGroups.name);
        if (groups.length === 0)
            return [];
        const groupIds = groups.map((g) => g.id);
        const standings = await this.db
            .select()
            .from(schema.groupStandings)
            .where((0, drizzle_orm_1.inArray)(schema.groupStandings.groupId, groupIds))
            .orderBy(schema.groupStandings.groupId, (0, drizzle_orm_1.sql) `total_points DESC,
          (points_for - points_against) DESC,
          points_for DESC,
          won DESC,
          participant_id ASC`);
        const standingsByGroup = new Map();
        for (const standing of standings) {
            const groupRows = standingsByGroup.get(standing.groupId) || [];
            groupRows.push(standing);
            standingsByGroup.set(standing.groupId, groupRows);
        }
        const groupMatches = await this.db
            .select({
            groupId: schema.matches.groupId,
            participant1Id: schema.matches.participant1Id,
            participant2Id: schema.matches.participant2Id,
            winnerId: schema.matches.winnerId,
            scoreDetails: schema.matches.scoreDetails,
        })
            .from(schema.matches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.matches.groupId, groupIds), (0, drizzle_orm_1.eq)(schema.matches.status, 'COMPLETED'), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)));
        const footballGroupIds = new Set(groupMatches
            .filter((match) => (0, football_standings_1.hasFootballScoreSnapshot)([match]))
            .map((match) => match.groupId)
            .filter((groupId) => Boolean(groupId)));
        for (const [groupId, groupRows] of standingsByGroup) {
            if (!footballGroupIds.has(groupId))
                continue;
            const ordered = (0, football_standings_1.sortFootballStandings)(groupRows, groupMatches);
            groupRows.splice(0, groupRows.length, ...ordered);
        }
        const sortedStandings = groups.flatMap((group) => {
            const rows = standingsByGroup.get(group.id) || [];
            return rows;
        });
        const participantIds = [
            ...new Set(sortedStandings.map((s) => s.participantId)),
        ];
        const participants = participantIds.length > 0
            ? await this.db
                .select({
                id: schema.tournamentParticipants.id,
                teamName: schema.tournamentParticipants.teamName,
                logoUrl: schema.tournamentParticipants.footballTeamLogoUrl,
                seed: schema.tournamentParticipants.seed,
            })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.id, participantIds))
            : [];
        const participantMap = new Map(participants.map((p) => [
            p.id,
            { teamName: p.teamName, logoUrl: p.logoUrl, seed: p.seed },
        ]));
        return {
            stages: stages.map((s) => ({
                id: s.id,
                name: s.name,
                type: s.type,
                order: s.order,
            })),
            groups: groups.map((g) => ({
                id: g.id,
                name: g.name,
                stageId: g.stageId,
            })),
            standings: sortedStandings.map((s) => ({
                id: s.id,
                groupId: s.groupId,
                participantId: s.participantId,
                teamName: participantMap.get(s.participantId)?.teamName || 'Unknown',
                logoUrl: participantMap.get(s.participantId)?.logoUrl || null,
                seed: participantMap.get(s.participantId)?.seed || null,
                played: s.played,
                won: s.won,
                lost: s.lost,
                draws: s.draws,
                pointsFor: s.pointsFor,
                pointsAgainst: s.pointsAgainst,
                totalPoints: s.totalPoints,
            })),
        };
    }
    async findTournamentResultMatches(tournamentId, divisionId) {
        const conditions = [
            (0, drizzle_orm_1.eq)(schema.matches.tournamentId, tournamentId),
            (0, drizzle_orm_1.isNull)(schema.matches.deletedAt),
            (0, drizzle_orm_1.isNull)(schema.tournamentStages.deletedAt),
        ];
        if (divisionId)
            conditions.push((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId));
        return this.db
            .select({
            id: schema.matches.id,
            status: schema.matches.status,
            winnerId: schema.matches.winnerId,
            participant1Id: schema.matches.participant1Id,
            participant2Id: schema.matches.participant2Id,
            roundNumber: schema.matches.roundNumber,
            matchOrder: schema.matches.matchOrder,
            bracketBranch: schema.matches.bracketBranch,
            groupId: schema.matches.groupId,
            stageId: schema.matches.stageId,
            stageType: schema.tournamentStages.type,
            stageName: schema.tournamentStages.name,
            matchConfig: schema.matches.matchConfig,
            participant1Name: (0, drizzle_orm_1.sql) `p1.team_name`,
            participant2Name: (0, drizzle_orm_1.sql) `p2.team_name`,
        })
            .from(schema.matches)
            .innerJoin(schema.tournamentStages, (0, drizzle_orm_1.eq)(schema.matches.stageId, schema.tournamentStages.id))
            .leftJoin((0, drizzle_orm_1.sql) `"tournament_participants" p1`, (0, drizzle_orm_1.sql) `p1.id = ${schema.matches.participant1Id}`)
            .leftJoin((0, drizzle_orm_1.sql) `"tournament_participants" p2`, (0, drizzle_orm_1.sql) `p2.id = ${schema.matches.participant2Id}`)
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy(schema.matches.roundNumber, schema.matches.matchOrder);
    }
};
exports.TournamentsRepository = TournamentsRepository;
exports.TournamentsRepository = TournamentsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, audit_service_1.AuditService,
        series_service_1.SeriesService])
], TournamentsRepository);
//# sourceMappingURL=tournaments.repository.js.map