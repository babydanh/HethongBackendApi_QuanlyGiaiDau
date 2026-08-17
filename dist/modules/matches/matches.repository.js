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
exports.MatchesRepository = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const drizzle_orm_1 = require("drizzle-orm");
const cursor_pagination_helper_1 = require("../../common/helpers/cursor-pagination.helper");
const audit_service_1 = require("../audit/audit.service");
const bracket_advancement_helper_1 = require("../../common/helpers/bracket-advancement.helper");
const football_two_leg_aggregate_1 = require("./utils/football-two-leg-aggregate");
function sumSetPoints(scoreDetails) {
    const football = scoreDetails?.football;
    if (football && typeof football === 'object' && !Array.isArray(football)) {
        const value = football;
        const p1 = Number(value.team1Goals);
        const p2 = Number(value.team2Goals);
        if (Number.isFinite(p1) && Number.isFinite(p2))
            return { p1, p2 };
    }
    let p1 = 0;
    let p2 = 0;
    if (scoreDetails?.sets && Array.isArray(scoreDetails.sets)) {
        for (const set of scoreDetails.sets) {
            p1 += Number(set.team1Score) || 0;
            p2 += Number(set.team2Score) || 0;
        }
    }
    return { p1, p2 };
}
let MatchesRepository = class MatchesRepository {
    db;
    auditService;
    constructor(db, auditService) {
        this.db = db;
        this.auditService = auditService;
    }
    async findAll(query) {
        const { page = 1, limit = 10, cursor, groupId, status, userId, bracketType, genderRestriction, city, isRanked, matchType, } = query;
        const publicOnly = query.publicOnly ?? query.isPublicOnly;
        const catId = query.categoryId || query.category_id;
        const take = limit + 1;
        const tId = query.tournamentId || query.tournament_id;
        const divisionId = query.divisionId || query.division_id;
        const conditions = [];
        conditions.push((0, drizzle_orm_1.isNull)(schema.matches.deletedAt));
        const isAllCategory = (val) => {
            const normalized = val
                .trim()
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[-_]+/g, ' ');
            return (normalized === '' ||
                normalized === 'all' ||
                normalized === 'undefined' ||
                normalized === 'null' ||
                normalized === 'tat ca' ||
                normalized === '0');
        };
        if (catId && !isAllCategory(catId)) {
            conditions.push((0, drizzle_orm_1.sql) `exists (
          select 1 from ${schema.tournaments} t
          left join ${schema.categories} c on t.category_id = c.id
          where (t.id = ${schema.matches.tournamentId} or t.id = (
            select s.tournament_id from ${schema.tournamentGroups} g
            join ${schema.tournamentStages} s on g.stage_id = s.id
            where g.id = ${schema.matches.groupId}
          ))
          and (
            t.category_id::text = ${catId}
            or c.id::text = ${catId}
            or c.slug = ${catId}
            or c.slug = replace(${catId}, '_', '-')
            or lower(c.name) = lower(${catId})
          )
        )`);
        }
        if (publicOnly) {
            conditions.push((0, drizzle_orm_1.sql) `(
          exists (
            select 1 from ${schema.tournaments} t
            where t.id = ${schema.matches.tournamentId}
            and t.deleted_at is null
            and (t.visibility = 'PUBLIC' or t.visibility is null)
            and t.status not in ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete')
          )
          or exists (
            select 1 from ${schema.tournamentGroups} g
            join ${schema.tournamentStages} s on g.stage_id = s.id
            join ${schema.tournaments} t on s.tournament_id = t.id
            where g.id = ${schema.matches.groupId}
            and t.deleted_at is null
            and (t.visibility = 'PUBLIC' or t.visibility is null)
            and t.status not in ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete')
          )
        )`);
        }
        if (city) {
            conditions.push((0, drizzle_orm_1.sql) `exists (
          select 1 from ${schema.tournaments} t
          where t.id = ${schema.matches.tournamentId}
          and t."city" = ${city}
        )`);
        }
        if (groupId) {
            conditions.push((0, drizzle_orm_1.eq)(schema.matches.groupId, groupId));
        }
        if (status) {
            const rawStatuses = status
                .split(',')
                .map((s) => s.trim().toUpperCase())
                .filter(Boolean);
            const expandedStatuses = new Set();
            for (const s of rawStatuses) {
                expandedStatuses.add(s);
                if (s === 'COMPLETED' ||
                    s === 'FINISHED' ||
                    s === 'DONE' ||
                    s === 'ENDED') {
                    expandedStatuses.add('COMPLETED');
                    expandedStatuses.add('FINISHED');
                    expandedStatuses.add('DONE');
                    expandedStatuses.add('ENDED');
                }
                else if (s === 'ONGOING' || s === 'LIVE' || s === 'PLAYING') {
                    expandedStatuses.add('ONGOING');
                    expandedStatuses.add('LIVE');
                    expandedStatuses.add('PLAYING');
                }
                else if (s === 'SCHEDULED' || s === 'UPCOMING' || s === 'PENDING') {
                    expandedStatuses.add('SCHEDULED');
                    expandedStatuses.add('UPCOMING');
                    expandedStatuses.add('PENDING');
                }
            }
            const statusList = Array.from(expandedStatuses);
            if (statusList.length === 1) {
                conditions.push((0, drizzle_orm_1.sql) `upper(${schema.matches.status}) = ${statusList[0]}`);
            }
            else if (statusList.length > 1) {
                conditions.push((0, drizzle_orm_1.inArray)((0, drizzle_orm_1.sql) `upper(${schema.matches.status})`, statusList));
            }
        }
        if (userId) {
            const rosters = await this.db
                .select({ participantId: schema.tournamentRosters.participantId })
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId));
            const pIds = rosters.map((r) => r.participantId);
            if (pIds.length === 0) {
                return {
                    data: [],
                    meta: {
                        total: 0,
                        page,
                        limit,
                        totalPages: 0,
                        nextCursor: null,
                        hasMore: false,
                    },
                };
            }
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(schema.matches.participant1Id, pIds), (0, drizzle_orm_1.inArray)(schema.matches.participant2Id, pIds)));
        }
        let decodedCursor = null;
        if (cursor) {
            decodedCursor = cursor_pagination_helper_1.CursorPaginationHelper.decodeCursor(cursor);
            if (decodedCursor) {
                conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.lt)(schema.matches.updatedAt, new Date(decodedCursor.updatedAt)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.updatedAt, new Date(decodedCursor.updatedAt)), (0, drizzle_orm_1.lt)(schema.matches.id, decodedCursor.id))));
            }
        }
        if (tId) {
            conditions.push((0, drizzle_orm_1.eq)(schema.matches.tournamentId, tId));
        }
        const hasStageFilters = Boolean(matchType || genderRestriction || bracketType || isRanked !== undefined);
        if (hasStageFilters) {
            const stageConditions = [
                (0, drizzle_orm_1.isNull)(schema.tournamentStages.deletedAt),
            ];
            if (tId)
                stageConditions.push((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tId));
            if (divisionId)
                stageConditions.push((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, divisionId));
            const stagesQuery = this.db
                .select({
                id: schema.tournamentStages.id,
                tournamentId: schema.tournamentStages.tournamentId,
            })
                .from(schema.tournamentStages)
                .leftJoin(schema.tournamentDivisions, (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, schema.tournamentDivisions.id))
                .leftJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, schema.tournaments.id))
                .where((0, drizzle_orm_1.and)(...stageConditions, ...(bracketType
                ? [
                    (0, drizzle_orm_1.sql) `${schema.tournaments.tournamentConfig}->>'bracketType' = ${bracketType}`,
                ]
                : []), ...(genderRestriction
                ? [
                    (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournamentDivisions.genderRestriction, genderRestriction), (0, drizzle_orm_1.isNull)(schema.tournamentDivisions.genderRestriction), (0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema.tournamentStages.tournamentDivisionId), (0, drizzle_orm_1.isNull)(schema.tournamentDivisions.genderRestriction)), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournaments.genderRestriction, genderRestriction), (0, drizzle_orm_1.isNull)(schema.tournaments.genderRestriction)))),
                ]
                : []), ...(matchType
                ? [
                    (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournamentDivisions.matchType, matchType), (0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema.tournamentStages.tournamentDivisionId), (0, drizzle_orm_1.isNull)(schema.tournamentDivisions.matchType)), (0, drizzle_orm_1.eq)(schema.tournaments.matchType, matchType))),
                ]
                : []), ...(isRanked !== undefined
                ? [(0, drizzle_orm_1.eq)(schema.tournaments.isRanked, isRanked)]
                : [])));
            const stages = await stagesQuery;
            const stageIds = stages.map((s) => s.id);
            const tournamentIds = Array.from(new Set(stages.map((s) => s.tournamentId).filter(Boolean)));
            if (stageIds.length === 0 && tournamentIds.length === 0) {
                return {
                    data: [],
                    meta: {
                        total: 0,
                        page,
                        limit,
                        totalPages: 0,
                        nextCursor: null,
                        hasMore: false,
                    },
                };
            }
            const groups = stageIds.length > 0
                ? await this.db
                    .select({ id: schema.tournamentGroups.id })
                    .from(schema.tournamentGroups)
                    .where((0, drizzle_orm_1.inArray)(schema.tournamentGroups.stageId, stageIds))
                : [];
            const groupIds = groups.map((g) => g.id);
            const matchScope = [];
            if (groupIds.length > 0)
                matchScope.push((0, drizzle_orm_1.inArray)(schema.matches.groupId, groupIds));
            if (tournamentIds.length > 0)
                matchScope.push((0, drizzle_orm_1.inArray)(schema.matches.tournamentId, tournamentIds));
            if (matchScope.length > 0) {
                conditions.push((0, drizzle_orm_1.or)(...matchScope));
            }
        }
        const whereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.matches)
            .where(whereClause);
        const matchesQuery = this.db
            .select()
            .from(schema.matches)
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema.matches.updatedAt), (0, drizzle_orm_1.desc)(schema.matches.id))
            .limit(take)
            .$dynamic();
        const rawData = await matchesQuery;
        const hasMore = rawData.length > limit;
        const data = hasMore ? rawData.slice(0, limit) : rawData;
        const lastItem = data[data.length - 1];
        const nextCursor = hasMore && lastItem
            ? cursor_pagination_helper_1.CursorPaginationHelper.encodeCursor({
                id: lastItem.id,
                updatedAt: lastItem.updatedAt,
            })
            : null;
        if (data.length === 0) {
            return {
                data: [],
                meta: {
                    total: totalRecord.count,
                    page,
                    limit,
                    totalPages: Math.ceil(totalRecord.count / limit),
                    nextCursor: null,
                    hasMore: false,
                },
            };
        }
        const participantIds = new Set();
        const groupIdsForMatches = new Set();
        const tournamentIdsForMatches = new Set();
        for (const match of data) {
            if (match.participant1Id)
                participantIds.add(match.participant1Id);
            if (match.participant2Id)
                participantIds.add(match.participant2Id);
            if (match.groupId)
                groupIdsForMatches.add(match.groupId);
            if (match.tournamentId)
                tournamentIdsForMatches.add(match.tournamentId);
        }
        const tournamentVenues = tournamentIdsForMatches.size > 0
            ? await this.db
                .select({
                tournamentId: schema.tournaments.id,
                venueName: schema.tournamentVenues.name,
                venueAddress: schema.tournamentVenues.locationAddress,
            })
                .from(schema.tournaments)
                .leftJoin(schema.tournamentVenues, (0, drizzle_orm_1.eq)(schema.tournaments.venueId, schema.tournamentVenues.id))
                .where((0, drizzle_orm_1.inArray)(schema.tournaments.id, Array.from(tournamentIdsForMatches)))
            : [];
        const tournamentVenueMap = new Map(tournamentVenues.map((venue) => [
            venue.tournamentId,
            { name: venue.venueName, address: venue.venueAddress },
        ]));
        const participantsMap = new Map();
        if (participantIds.size > 0) {
            const participantsData = await this.db
                .select({
                id: schema.tournamentParticipants.id,
                teamName: schema.tournamentParticipants.teamName,
                seed: schema.tournamentParticipants.seed,
            })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.id, Array.from(participantIds)));
            const rosters = await this.db
                .select({
                participantId: schema.tournamentRosters.participantId,
                userId: schema.tournamentRosters.userId,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
                eloPoints: schema.userRanks.eloPoints,
            })
                .from(schema.tournamentRosters)
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, schema.profiles.userId))
                .leftJoin(schema.userRanks, (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, schema.userRanks.userId))
                .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, Array.from(participantIds)));
            const rostersMap = new Map();
            for (const r of rosters) {
                const list = rostersMap.get(r.participantId) || [];
                list.push({
                    userId: r.userId,
                    fullName: r.fullName,
                    avatarUrl: r.avatarUrl,
                    elo: r.eloPoints !== null && r.eloPoints !== undefined
                        ? { eloPoints: r.eloPoints }
                        : undefined,
                });
                rostersMap.set(r.participantId, list);
            }
            for (const p of participantsData) {
                participantsMap.set(p.id, {
                    ...p,
                    members: rostersMap.get(p.id) || [],
                });
            }
        }
        const groupsMap = new Map();
        if (groupIdsForMatches.size > 0) {
            const groupsData = await this.db
                .select({
                groupId: schema.tournamentGroups.id,
                groupName: schema.tournamentGroups.name,
                stageName: schema.tournamentStages.name,
                stageType: schema.tournamentStages.type,
                stageRoundConfig: schema.tournamentStages.roundConfig,
                groupRoundConfig: schema.tournamentGroups.roundConfig,
                tournamentName: schema.tournaments.name,
                venueName: (0, drizzle_orm_1.sql) `coalesce(
            (select division_venue.name from tournament_venues division_venue
             where division_venue.id = tournament_divisions.venue_id
               and division_venue.deleted_at is null),
            ${schema.tournamentVenues.name}
          )`,
                venueAddress: (0, drizzle_orm_1.sql) `coalesce(
            (select division_venue.location_address from tournament_venues division_venue
             where division_venue.id = tournament_divisions.venue_id
               and division_venue.deleted_at is null),
            ${schema.tournamentVenues.locationAddress}
          )`,
                categoryId: schema.tournaments.categoryId,
                categoryName: schema.categories.name,
                matchType: schema.tournaments.matchType,
                genderRestriction: schema.tournaments.genderRestriction,
                divisionMatchType: schema.tournamentDivisions.matchType,
                divisionGenderRestriction: schema.tournamentDivisions.genderRestriction,
            })
                .from(schema.tournamentGroups)
                .innerJoin(schema.tournamentStages, (0, drizzle_orm_1.eq)(schema.tournamentGroups.stageId, schema.tournamentStages.id))
                .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, schema.tournaments.id))
                .leftJoin(schema.tournamentDivisions, (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, schema.tournamentDivisions.id))
                .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.tournaments.categoryId, schema.categories.id))
                .leftJoin(schema.tournamentVenues, (0, drizzle_orm_1.eq)(schema.tournaments.venueId, schema.tournamentVenues.id))
                .where((0, drizzle_orm_1.inArray)(schema.tournamentGroups.id, Array.from(groupIdsForMatches)));
            for (const g of groupsData) {
                groupsMap.set(g.groupId, {
                    id: g.groupId,
                    name: g.groupName,
                    stageName: g.stageName,
                    stageType: g.stageType || undefined,
                    stageRoundConfig: g.stageRoundConfig,
                    groupRoundConfig: g.groupRoundConfig,
                    tournamentName: g.tournamentName,
                    categoryId: g.categoryId || undefined,
                    categoryName: g.categoryName || undefined,
                    venueName: g.venueName || null,
                    venueAddress: g.venueAddress || null,
                    matchType: g.divisionMatchType || g.matchType || undefined,
                    genderRestriction: g.divisionGenderRestriction || g.genderRestriction || undefined,
                });
            }
        }
        const mappedData = data.map((match) => {
            const p1 = match.participant1Id
                ? participantsMap.get(match.participant1Id)
                : null;
            const p2 = match.participant2Id
                ? participantsMap.get(match.participant2Id)
                : null;
            const groupStage = match.groupId ? groupsMap.get(match.groupId) : null;
            return {
                ...match,
                cheerCount: match.cheerCount ?? 0,
                participant1: p1
                    ? {
                        id: p1.id,
                        teamName: p1.teamName,
                        seed: p1.seed,
                        members: p1.members,
                    }
                    : null,
                participant2: p2
                    ? {
                        id: p2.id,
                        teamName: p2.teamName,
                        seed: p2.seed,
                        members: p2.members,
                    }
                    : null,
                group: groupStage
                    ? {
                        id: groupStage.id,
                        name: groupStage.name,
                        roundConfig: groupStage.groupRoundConfig,
                        stage: {
                            name: groupStage.stageName,
                            type: groupStage.stageType,
                            roundConfig: groupStage.stageRoundConfig,
                        },
                    }
                    : null,
                tournament: {
                    name: groupStage?.tournamentName || null,
                    venueName: groupStage?.venueName ||
                        tournamentVenueMap.get(match.tournamentId)?.name ||
                        null,
                    venueAddress: groupStage?.venueAddress ||
                        tournamentVenueMap.get(match.tournamentId)?.address ||
                        null,
                    categoryId: groupStage?.categoryId,
                    matchType: groupStage?.matchType,
                    genderRestriction: groupStage?.genderRestriction,
                    category: {
                        name: groupStage?.categoryName,
                    },
                },
            };
        });
        return {
            data: mappedData,
            meta: {
                total: totalRecord.count,
                page,
                limit,
                totalPages: Math.ceil(totalRecord.count / limit),
                nextCursor,
                hasMore,
            },
        };
    }
    async findById(id) {
        const result = await this.db
            .select()
            .from(schema.matches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.id, id), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)))
            .limit(1);
        if (result.length === 0)
            return null;
        const match = result[0];
        let refereeName = null;
        if (match.refereeId) {
            const [refereeProfile] = await this.db
                .select({ fullName: schema.profiles.fullName })
                .from(schema.profiles)
                .where((0, drizzle_orm_1.eq)(schema.profiles.userId, match.refereeId))
                .limit(1);
            refereeName = refereeProfile?.fullName ?? null;
        }
        const [group] = await this.db
            .select({
            groupId: schema.tournamentGroups.id,
            name: schema.tournamentGroups.name,
            groupRoundConfig: schema.tournamentGroups.roundConfig,
            stageId: schema.tournamentStages.id,
            stageName: schema.tournamentStages.name,
            tournamentId: schema.tournaments.id,
            tournamentName: schema.tournaments.name,
            tournamentType: schema.tournaments.tournamentType,
            tournamentStatus: schema.tournaments.status,
            tournamentVisibility: schema.tournaments.visibility,
            isRanked: schema.tournaments.isRanked,
            communityId: schema.tournaments.communityId,
            categoryId: schema.tournaments.categoryId,
            matchType: schema.tournaments.matchType,
            genderRestriction: schema.tournaments.genderRestriction,
            divisionMatchType: schema.tournamentDivisions.matchType,
            divisionGenderRestriction: schema.tournamentDivisions.genderRestriction,
            createdBy: schema.tournaments.createdBy,
            venueId: schema.tournaments.venueId,
            venueName: (0, drizzle_orm_1.sql) `coalesce(
          (select division_venue.name from tournament_venues division_venue
           where division_venue.id = tournament_divisions.venue_id
             and division_venue.deleted_at is null),
          ${schema.tournamentVenues.name}
        )`,
            venueAddress: (0, drizzle_orm_1.sql) `coalesce(
          (select division_venue.location_address from tournament_venues division_venue
           where division_venue.id = tournament_divisions.venue_id
             and division_venue.deleted_at is null),
          ${schema.tournamentVenues.locationAddress}
        )`,
            stageType: schema.tournamentStages.type,
            roundConfig: schema.tournamentStages.roundConfig,
            sportRules: schema.tournaments.sportRules,
            tournamentConfig: schema.tournaments.tournamentConfig,
            categoryName: schema.categories.name,
            categorySlug: schema.categories.slug,
            categoryConfig: schema.categories.categoryConfig,
        })
            .from(schema.tournamentStages)
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, schema.tournaments.id))
            .leftJoin(schema.tournamentDivisions, (0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentDivisionId, schema.tournamentDivisions.id))
            .leftJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.categories.id, schema.tournaments.categoryId))
            .leftJoin(schema.tournamentVenues, (0, drizzle_orm_1.eq)(schema.tournaments.venueId, schema.tournamentVenues.id))
            .leftJoin(schema.tournamentGroups, (0, drizzle_orm_1.eq)(schema.tournamentGroups.id, match.groupId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStages.id, match.stageId), (0, drizzle_orm_1.eq)(schema.tournaments.id, match.tournamentId), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
            .limit(1);
        if (!group)
            return null;
        let participant1 = null;
        let participant2 = null;
        const participantIds = [match.participant1Id, match.participant2Id].filter((participantId) => typeof participantId === 'string' && participantId.length > 0);
        if (participantIds.length > 0) {
            const participants = await this.db
                .select({
                id: schema.tournamentParticipants.id,
                teamName: schema.tournamentParticipants.teamName,
                tournamentDivisionId: schema.tournamentParticipants.tournamentDivisionId,
            })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.id, participantIds));
            const rosters = await this.db
                .select({
                participantId: schema.tournamentRosters.participantId,
                userId: schema.tournamentRosters.userId,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
                eloPoints: schema.userRanks.eloPoints,
            })
                .from(schema.tournamentRosters)
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, schema.profiles.userId))
                .leftJoin(schema.userRanks, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, schema.userRanks.userId), (0, drizzle_orm_1.eq)(schema.userRanks.categoryId, group.categoryId)))
                .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, participantIds));
            const rostersByParticipant = new Map();
            for (const roster of rosters) {
                const list = rostersByParticipant.get(roster.participantId) ?? [];
                list.push({
                    userId: roster.userId,
                    fullName: roster.fullName,
                    avatarUrl: roster.avatarUrl,
                    elo: roster.eloPoints == null
                        ? undefined
                        : { eloPoints: roster.eloPoints },
                });
                rostersByParticipant.set(roster.participantId, list);
            }
            const matchType = group.divisionMatchType ?? group.matchType;
            const isDoubles = matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
            const userIds = rosters.map((roster) => roster.userId);
            const pairEloByKey = new Map();
            if (isDoubles && group.categoryId && userIds.length >= 2) {
                const pairRanks = await this.db
                    .select({
                    user1Id: schema.pairRanks.user1Id,
                    user2Id: schema.pairRanks.user2Id,
                    eloPoints: schema.pairRanks.eloPoints,
                    scope: schema.pairRanks.scope,
                    communityId: schema.pairRanks.communityId,
                })
                    .from(schema.pairRanks)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.pairRanks.categoryId, group.categoryId), (0, drizzle_orm_1.inArray)(schema.pairRanks.matchType, ['DOUBLES', 'MIXED_DOUBLES']), (0, drizzle_orm_1.or)((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.pairRanks.user1Id, userIds), (0, drizzle_orm_1.inArray)(schema.pairRanks.user2Id, userIds)))));
                const ordered = pairRanks.sort((a, b) => {
                    const score = (row) => group.communityId &&
                        row.scope === 'COMMUNITY' &&
                        row.communityId === group.communityId
                        ? 2
                        : row.scope === 'PUBLIC' && row.communityId == null
                            ? 1
                            : 0;
                    return score(b) - score(a);
                });
                for (const row of ordered) {
                    const key = [row.user1Id, row.user2Id].sort().join(':');
                    if (!pairEloByKey.has(key))
                        pairEloByKey.set(key, row.eloPoints);
                }
            }
            const toParticipant = (participant) => {
                const members = rostersByParticipant.get(participant.id) ?? [];
                const pairKey = members.length >= 2
                    ? members
                        .slice(0, 2)
                        .map((member) => member.userId)
                        .sort()
                        .join(':')
                    : null;
                return {
                    ...participant,
                    members,
                    eloPoints: isDoubles && pairKey
                        ? (pairEloByKey.get(pairKey) ?? null)
                        : (members[0]?.elo?.eloPoints ?? null),
                };
            };
            participant1 = participants.find((participant) => participant.id === match.participant1Id)
                ? toParticipant(participants.find((participant) => participant.id === match.participant1Id))
                : null;
            participant2 = participants.find((participant) => participant.id === match.participant2Id)
                ? toParticipant(participants.find((participant) => participant.id === match.participant2Id))
                : null;
        }
        return {
            ...match,
            refereeName,
            groupName: group?.name || '',
            tournamentId: group?.tournamentId || '',
            tournament: group
                ? {
                    id: group.tournamentId,
                    name: group.tournamentName,
                    tournamentType: group.tournamentType,
                    status: group.tournamentStatus,
                    visibility: group.tournamentVisibility,
                    isRanked: group.isRanked,
                    communityId: group.communityId,
                    categoryId: group.categoryId,
                    categoryName: group.categoryName,
                    categorySlug: group.categorySlug,
                    categoryConfig: group.categoryConfig,
                    matchType: group.divisionMatchType ?? group.matchType,
                    genderRestriction: group.divisionGenderRestriction ?? group.genderRestriction,
                    createdBy: group.createdBy,
                    sportRules: group.sportRules,
                    tournamentConfig: group.tournamentConfig,
                    venueName: group.venueName,
                    venueAddress: group.venueAddress,
                }
                : null,
            stage: group
                ? {
                    id: group.stageId,
                    name: group.stageName,
                    type: group.stageType,
                    roundConfig: group.roundConfig,
                }
                : null,
            group: group?.groupId
                ? {
                    id: group.groupId,
                    name: group.name,
                    roundConfig: group.groupRoundConfig,
                }
                : null,
            participant1,
            participant2,
        };
    }
    async findCommentsByMatchId(matchId, mutedUserIds = []) {
        const conditions = [(0, drizzle_orm_1.eq)(schema.matchComments.matchId, matchId)];
        if (mutedUserIds.length > 0) {
            conditions.push((0, drizzle_orm_1.notInArray)(schema.matchComments.userId, mutedUserIds));
        }
        return this.db
            .select({
            id: schema.matchComments.id,
            matchId: schema.matchComments.matchId,
            commentText: schema.matchComments.commentText,
            createdAt: schema.matchComments.createdAt,
            user: {
                id: schema.users.id,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            },
        })
            .from(schema.matchComments)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.matchComments.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.sql) `${schema.matchComments.createdAt} desc`);
    }
    async createComment(matchId, userId, commentText) {
        const [created] = await this.db
            .insert(schema.matchComments)
            .values({
            matchId,
            userId,
            commentText,
        })
            .returning();
        const [comment] = await this.db
            .select({
            id: schema.matchComments.id,
            matchId: schema.matchComments.matchId,
            commentText: schema.matchComments.commentText,
            createdAt: schema.matchComments.createdAt,
            user: {
                id: schema.users.id,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            },
        })
            .from(schema.matchComments)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.matchComments.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.matchComments.id, created.id))
            .limit(1);
        return comment;
    }
    async updateScore(id, userId, data) {
        const updated = await this.db.transaction(async (tx) => {
            const [existing] = await tx
                .select({
                p1SetsWon: schema.matches.p1SetsWon,
                p2SetsWon: schema.matches.p2SetsWon,
                scoreDetails: schema.matches.scoreDetails,
                winnerId: schema.matches.winnerId,
                status: schema.matches.status,
            })
                .from(schema.matches)
                .where((0, drizzle_orm_1.eq)(schema.matches.id, id))
                .limit(1);
            if (!existing) {
                throw new common_1.NotFoundException('Match not found');
            }
            const [up] = await tx
                .update(schema.matches)
                .set({
                p1SetsWon: data.p1SetsWon,
                p2SetsWon: data.p2SetsWon,
                ...(data.scoreDetails && { scoreDetails: data.scoreDetails }),
                ...(data.winnerId && { winnerId: data.winnerId }),
                scoreConfirmedBy: userId,
                scoreConfirmedAt: new Date(),
                updatedAt: new Date(),
                revision: (0, drizzle_orm_1.sql) `${schema.matches.revision} + 1`,
            })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.id, id), ...(data.expectedRevision !== undefined
                ? [(0, drizzle_orm_1.eq)(schema.matches.revision, data.expectedRevision)]
                : [])))
                .returning();
            if (!up) {
                const [current] = await tx
                    .select({
                    status: schema.matches.status,
                    revision: schema.matches.revision,
                })
                    .from(schema.matches)
                    .where((0, drizzle_orm_1.eq)(schema.matches.id, id))
                    .limit(1);
                return { conflict: true, currentMatch: current };
            }
            const oldValues = {
                p1SetsWon: existing.p1SetsWon,
                p2SetsWon: existing.p2SetsWon,
                scoreDetails: existing.scoreDetails,
                winnerId: existing.winnerId,
                status: existing.status,
            };
            const newValues = {
                p1SetsWon: up.p1SetsWon,
                p2SetsWon: up.p2SetsWon,
                scoreDetails: up.scoreDetails,
                winnerId: up.winnerId,
                status: up.status,
            };
            await this.auditService.logUpdate(tx, userId, 'matches', id, oldValues, newValues);
            return [up];
        });
        if (updated && typeof updated === 'object' && 'conflict' in updated) {
            return updated;
        }
        const rows = updated;
        return await this.findById(rows[0].id);
    }
    async updateStatus(id, data) {
        const setClause = {
            status: data.status,
            updatedAt: new Date(),
            revision: (0, drizzle_orm_1.sql) `${schema.matches.revision} + 1`,
        };
        if (data.status === 'ONGOING') {
            setClause.startedAt = new Date();
        }
        else if (data.status === 'COMPLETED') {
            setClause.completedAt = new Date();
        }
        const [updated] = await this.db
            .update(schema.matches)
            .set(setClause)
            .where((0, drizzle_orm_1.eq)(schema.matches.id, id))
            .returning();
        return await this.findById(updated.id);
    }
    async findCompletedTieLeg(tieId, currentMatchId) {
        const [leg] = await this.db
            .select()
            .from(schema.matches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tieId, tieId), (0, drizzle_orm_1.ne)(schema.matches.id, currentMatchId), (0, drizzle_orm_1.eq)(schema.matches.status, 'COMPLETED'), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)))
            .orderBy(schema.matches.leg)
            .limit(1);
        return leg ?? null;
    }
    async completeMatch(id, winnerId, matchDetails) {
        return await this.db.transaction(async (tx) => {
            const updated = await this.completeMatchInTx(tx, id, winnerId, {
                p1SetsWon: matchDetails.p1SetsWon,
                p2SetsWon: matchDetails.p2SetsWon,
                scoreDetails: matchDetails.scoreDetails,
                auditUserId: matchDetails.auditUserId,
                expectedRevision: matchDetails.expectedRevision,
            });
            if (updated && typeof updated === 'object' && 'conflict' in updated) {
                return updated;
            }
            if (matchDetails.isRoundRobin && updated) {
                const [group] = await tx
                    .select({
                    tournamentId: schema.tournamentStages.tournamentId,
                })
                    .from(schema.tournamentGroups)
                    .innerJoin(schema.tournamentStages, (0, drizzle_orm_1.eq)(schema.tournamentGroups.stageId, schema.tournamentStages.id))
                    .where((0, drizzle_orm_1.eq)(schema.tournamentGroups.id, updated.groupId))
                    .limit(1);
                let winPoints = 3;
                let drawPoints = 1;
                let lossPoints = 0;
                if (group) {
                    const [tournament] = await tx
                        .select({
                        sportRules: schema.tournaments.sportRules,
                    })
                        .from(schema.tournaments)
                        .where((0, drizzle_orm_1.eq)(schema.tournaments.id, group.tournamentId))
                        .limit(1);
                    if (tournament && tournament.sportRules) {
                        const rules = tournament.sportRules;
                        const scoring = rules.scoring ?? rules;
                        if (typeof scoring.winPoints === 'number')
                            winPoints = scoring.winPoints;
                        if (typeof scoring.drawPoints === 'number')
                            drawPoints = scoring.drawPoints;
                        if (typeof scoring.lossPoints === 'number')
                            lossPoints = scoring.lossPoints;
                    }
                }
                const p1Id = updated.participant1Id;
                const p2Id = updated.participant2Id;
                const participants = [p1Id, p2Id];
                const isDraw = !winnerId && p1Id && p2Id;
                const { p1: team1Total, p2: team2Total } = sumSetPoints(matchDetails.scoreDetails);
                for (const pId of participants) {
                    if (!pId)
                        continue;
                    const isWinner = pId === winnerId;
                    const pointsEarned = isDraw
                        ? drawPoints
                        : isWinner
                            ? winPoints
                            : lossPoints;
                    const pointsFor = pId === p1Id ? team1Total : team2Total;
                    const pointsAgainst = pId === p1Id ? team2Total : team1Total;
                    await tx
                        .insert(schema.groupStandings)
                        .values({
                        groupId: updated.groupId,
                        participantId: pId,
                        played: 1,
                        won: isWinner ? 1 : 0,
                        lost: !isWinner && !isDraw ? 1 : 0,
                        draws: isDraw ? 1 : 0,
                        pointsFor: pointsFor,
                        pointsAgainst: pointsAgainst,
                        totalPoints: pointsEarned,
                        updatedAt: new Date(),
                    })
                        .onConflictDoUpdate({
                        target: [
                            schema.groupStandings.groupId,
                            schema.groupStandings.participantId,
                        ],
                        set: {
                            played: (0, drizzle_orm_1.sql) `${schema.groupStandings.played} + 1`,
                            won: (0, drizzle_orm_1.sql) `${schema.groupStandings.won} + ${isWinner ? 1 : 0}`,
                            lost: (0, drizzle_orm_1.sql) `${schema.groupStandings.lost} + ${!isWinner && !isDraw ? 1 : 0}`,
                            draws: (0, drizzle_orm_1.sql) `${schema.groupStandings.draws} + ${isDraw ? 1 : 0}`,
                            pointsFor: (0, drizzle_orm_1.sql) `${schema.groupStandings.pointsFor} + ${pointsFor}`,
                            pointsAgainst: (0, drizzle_orm_1.sql) `${schema.groupStandings.pointsAgainst} + ${pointsAgainst}`,
                            totalPoints: (0, drizzle_orm_1.sql) `${schema.groupStandings.totalPoints} + ${pointsEarned}`,
                            updatedAt: new Date(),
                        },
                    });
                }
            }
            return updated;
        });
    }
    async completeMatchInTx(tx, id, winnerId, details) {
        const [existing] = await tx
            .select()
            .from(schema.matches)
            .where((0, drizzle_orm_1.eq)(schema.matches.id, id))
            .limit(1);
        if (!existing)
            return null;
        const [updated] = await tx
            .update(schema.matches)
            .set({
            status: 'COMPLETED',
            winnerId,
            p1SetsWon: details.p1SetsWon,
            p2SetsWon: details.p2SetsWon,
            scoreDetails: details.scoreDetails,
            isBye: details.isBye ?? existing.isBye,
            completedAt: new Date(),
            updatedAt: new Date(),
            revision: (0, drizzle_orm_1.sql) `${schema.matches.revision} + 1`,
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.id, id), (0, drizzle_orm_1.ne)(schema.matches.status, 'COMPLETED'), ...(details.expectedRevision !== undefined
            ? [(0, drizzle_orm_1.eq)(schema.matches.revision, details.expectedRevision)]
            : [])))
            .returning();
        if (!updated) {
            const [current] = await tx
                .select({
                status: schema.matches.status,
                revision: schema.matches.revision,
            })
                .from(schema.matches)
                .where((0, drizzle_orm_1.eq)(schema.matches.id, id))
                .limit(1);
            if (!current || current.status === 'COMPLETED')
                return null;
            return { conflict: true, currentMatch: current };
        }
        const oldValues = {
            p1SetsWon: existing.p1SetsWon,
            p2SetsWon: existing.p2SetsWon,
            scoreDetails: existing.scoreDetails,
            winnerId: existing.winnerId,
            status: existing.status,
        };
        const newValues = {
            p1SetsWon: updated.p1SetsWon,
            p2SetsWon: updated.p2SetsWon,
            scoreDetails: updated.scoreDetails,
            winnerId: updated.winnerId,
            status: updated.status,
        };
        await this.auditService.logUpdate(tx, details.auditUserId ?? null, 'matches', id, oldValues, newValues);
        const [eloTournament] = await tx
            .select({ isRanked: schema.tournaments.isRanked })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, existing.tournamentId))
            .limit(1);
        const participantIds = [
            existing.participant1Id,
            existing.participant2Id,
        ].filter((participantId) => Boolean(participantId));
        const consentRows = participantIds.length
            ? await tx
                .select({
                rankingConsent: schema.tournamentParticipants.rankingConsent,
            })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.id, participantIds))
            : [];
        const allParticipantsConsented = participantIds.length === consentRows.length &&
            consentRows.every((row) => row.rankingConsent);
        const footballTeamRows = participantIds.length
            ? await tx
                .select({
                footballTeamId: schema.tournamentParticipants.footballTeamId,
            })
                .from(schema.tournamentParticipants)
                .where((0, drizzle_orm_1.inArray)(schema.tournamentParticipants.id, participantIds))
            : [];
        const isFootballTeamMatch = footballTeamRows.length === participantIds.length &&
            footballTeamRows.length === 2 &&
            footballTeamRows.every((row) => Boolean(row.footballTeamId));
        if (eloTournament?.isRanked &&
            (winnerId || isFootballTeamMatch) &&
            allParticipantsConsented) {
            await tx
                .insert(schema.matchEloOutbox)
                .values({
                matchId: id,
                status: 'PENDING',
                attempts: 0,
                nextAttemptAt: new Date(),
            })
                .onConflictDoNothing({ target: schema.matchEloOutbox.matchId });
        }
        let effectiveWinnerId = winnerId;
        if (updated.tieId && updated.leg) {
            const [otherLeg] = await tx
                .select()
                .from(schema.matches)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tieId, updated.tieId), (0, drizzle_orm_1.ne)(schema.matches.id, updated.id), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)))
                .limit(1);
            const otherDone = otherLeg && otherLeg.status === 'COMPLETED';
            const thisDone = updated.status === 'COMPLETED';
            if (otherDone && thisDone && updated.nextMatchId) {
                const leg1 = updated.leg === 1 ? updated : otherLeg;
                const leg2 = updated.leg === 2 ? updated : otherLeg;
                const updatedDetails = updated.scoreDetails;
                const shootout = (updatedDetails?.shootout ??
                    updatedDetails?.football
                        ?.shootout);
                const shootoutWinnerId = typeof shootout?.winnerId === 'string' ? shootout.winnerId : null;
                effectiveWinnerId = (0, football_two_leg_aggregate_1.aggregateFootballTwoLegs)(leg1, leg2, shootoutWinnerId).winnerId;
            }
        }
        else if (!effectiveWinnerId && updated.tieId && updated.nextMatchId) {
            const updatedDetails = updated.scoreDetails;
            const shootout = (updatedDetails?.shootout ??
                updatedDetails?.football
                    ?.shootout);
            effectiveWinnerId = shootout?.winnerId ?? null;
        }
        if (effectiveWinnerId && existing.nextMatchId) {
            const [nextMatch] = await tx
                .select()
                .from(schema.matches)
                .where((0, drizzle_orm_1.eq)(schema.matches.id, existing.nextMatchId))
                .limit(1);
            if (nextMatch) {
                const targetSlot = (0, bracket_advancement_helper_1.resolveWinnerTargetSlot)({
                    sourceBranch: existing.bracketBranch,
                    sourceRoundNumber: existing.roundNumber,
                    sourceMatchOrder: existing.matchOrder,
                    targetBranch: nextMatch.bracketBranch,
                });
                const updateField = { [targetSlot]: effectiveWinnerId };
                await tx
                    .update(schema.matches)
                    .set(updateField)
                    .where((0, drizzle_orm_1.eq)(schema.matches.id, existing.nextMatchId));
                await this.autoCompleteIfByeMatch(tx, existing.nextMatchId, details.auditUserId);
            }
        }
        if (existing.loserNextMatchId) {
            const [loserNextMatch] = await tx
                .select()
                .from(schema.matches)
                .where((0, drizzle_orm_1.eq)(schema.matches.id, existing.loserNextMatchId))
                .limit(1);
            if (loserNextMatch) {
                const loserId = winnerId === existing.participant1Id
                    ? existing.participant2Id
                    : existing.participant1Id;
                const targetSlot = (0, bracket_advancement_helper_1.resolveLoserTargetSlot)({
                    sourceRoundNumber: existing.roundNumber,
                    sourceMatchOrder: existing.matchOrder,
                });
                const updateField = { [targetSlot]: loserId };
                await tx
                    .update(schema.matches)
                    .set(updateField)
                    .where((0, drizzle_orm_1.eq)(schema.matches.id, existing.loserNextMatchId));
                await this.autoCompleteIfByeMatch(tx, existing.loserNextMatchId, details.auditUserId);
            }
        }
        return updated;
    }
    async autoCompleteIfByeMatch(tx, targetId, auditUserId) {
        const [targetMatch] = await tx
            .select()
            .from(schema.matches)
            .where((0, drizzle_orm_1.eq)(schema.matches.id, targetId))
            .limit(1);
        if (!targetMatch || targetMatch.status === 'COMPLETED')
            return;
        const feedingMatches = await tx
            .select()
            .from(schema.matches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, targetMatch.tournamentId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.matches.nextMatchId, targetId), (0, drizzle_orm_1.eq)(schema.matches.loserNextMatchId, targetId))));
        let p1Fed = false;
        let p2Fed = false;
        let p1FedCompleted = false;
        let p2FedCompleted = false;
        for (const fm of feedingMatches) {
            let targetSlot = null;
            if (fm.nextMatchId === targetId) {
                targetSlot =
                    (0, bracket_advancement_helper_1.resolveWinnerTargetSlot)({
                        sourceBranch: fm.bracketBranch,
                        sourceRoundNumber: fm.roundNumber,
                        sourceMatchOrder: fm.matchOrder,
                        targetBranch: targetMatch.bracketBranch,
                    }) === 'participant1Id'
                        ? 'p1'
                        : 'p2';
            }
            else if (fm.loserNextMatchId === targetId) {
                targetSlot =
                    (0, bracket_advancement_helper_1.resolveLoserTargetSlot)({
                        sourceRoundNumber: fm.roundNumber,
                        sourceMatchOrder: fm.matchOrder,
                    }) === 'participant1Id'
                        ? 'p1'
                        : 'p2';
            }
            if (targetSlot === 'p1') {
                p1Fed = true;
                if (fm.status === 'COMPLETED')
                    p1FedCompleted = true;
            }
            else if (targetSlot === 'p2') {
                p2Fed = true;
                if (fm.status === 'COMPLETED')
                    p2FedCompleted = true;
            }
        }
        const p1PermanentlyEmpty = !p1Fed || (p1FedCompleted && !targetMatch.participant1Id);
        const p2PermanentlyEmpty = !p2Fed || (p2FedCompleted && !targetMatch.participant2Id);
        if (targetMatch.participant1Id && p2PermanentlyEmpty) {
            await this.completeMatchInTx(tx, targetId, targetMatch.participant1Id, {
                p1SetsWon: 0,
                p2SetsWon: 0,
                scoreDetails: { isBye: true },
                isBye: true,
                auditUserId,
            });
        }
        else if (targetMatch.participant2Id && p1PermanentlyEmpty) {
            await this.completeMatchInTx(tx, targetId, targetMatch.participant2Id, {
                p1SetsWon: 0,
                p2SetsWon: 0,
                scoreDetails: { isBye: true },
                isBye: true,
                auditUserId,
            });
        }
    }
    async getRostersForParticipants(participantIds) {
        if (!participantIds || participantIds.length === 0)
            return [];
        return this.db
            .select({
            userId: schema.tournamentRosters.userId,
            participantId: schema.tournamentRosters.participantId,
        })
            .from(schema.tournamentRosters)
            .where((0, drizzle_orm_1.inArray)(schema.tournamentRosters.participantId, participantIds));
    }
    async updateSchedule(id, userId, data) {
        return this.db.transaction(async (tx) => {
            const [existing] = await tx
                .select()
                .from(schema.matches)
                .where((0, drizzle_orm_1.eq)(schema.matches.id, id))
                .limit(1);
            if (!existing)
                return undefined;
            await tx.execute((0, drizzle_orm_1.sql) `SELECT pg_advisory_xact_lock(hashtext(${`match-schedule:${existing.tournamentId}`}))`);
            const effectiveCourtName = data.courtName !== undefined
                ? data.courtName?.trim() || null
                : existing.courtName;
            const effectiveScheduledAt = data.scheduledAt !== undefined
                ? data.scheduledAt
                    ? new Date(data.scheduledAt)
                    : null
                : existing.scheduledAt;
            if (effectiveScheduledAt &&
                Number.isNaN(effectiveScheduledAt.getTime())) {
                throw new common_1.BadRequestException('Thời gian thi đấu không hợp lệ.');
            }
            if (effectiveScheduledAt) {
                const scheduledDate = effectiveScheduledAt;
                const conflictStart = new Date(scheduledDate.getTime() - 2 * 60 * 60 * 1000);
                const conflictEnd = new Date(scheduledDate.getTime() + 2 * 60 * 60 * 1000);
                const activeScheduledStatuses = (0, drizzle_orm_1.inArray)(schema.matches.status, [
                    'SCHEDULED',
                    'ONGOING',
                ]);
                if (effectiveCourtName) {
                    const conflict = await tx
                        .select({ id: schema.matches.id })
                        .from(schema.matches)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.courtName, effectiveCourtName), (0, drizzle_orm_1.eq)(schema.matches.tournamentId, existing.tournamentId), (0, drizzle_orm_1.ne)(schema.matches.id, id), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt), activeScheduledStatuses, (0, drizzle_orm_1.gte)(schema.matches.scheduledAt, conflictStart), (0, drizzle_orm_1.lte)(schema.matches.scheduledAt, conflictEnd)))
                        .limit(1);
                    if (conflict.length > 0) {
                        throw new common_1.BadRequestException(`Sân ${effectiveCourtName} đã có trận đấu khác trong khung giờ này (${conflictStart.toLocaleTimeString('vi-VN')} - ${conflictEnd.toLocaleTimeString('vi-VN')}).`);
                    }
                }
                const participantIds = [
                    existing.participant1Id,
                    existing.participant2Id,
                ].filter((participantId) => Boolean(participantId));
                if (participantIds.length > 0) {
                    const participantConflict = await tx
                        .select({
                        id: schema.matches.id,
                        participant1Id: schema.matches.participant1Id,
                        participant2Id: schema.matches.participant2Id,
                    })
                        .from(schema.matches)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, existing.tournamentId), (0, drizzle_orm_1.ne)(schema.matches.id, id), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt), activeScheduledStatuses, (0, drizzle_orm_1.gte)(schema.matches.scheduledAt, conflictStart), (0, drizzle_orm_1.lte)(schema.matches.scheduledAt, conflictEnd), (0, drizzle_orm_1.or)((0, drizzle_orm_1.inArray)(schema.matches.participant1Id, participantIds), (0, drizzle_orm_1.inArray)(schema.matches.participant2Id, participantIds))))
                        .limit(1);
                    if (participantConflict.length > 0) {
                        throw new common_1.BadRequestException('Một đội đã có trận đấu khác trong khung giờ này.');
                    }
                }
            }
            const [updated] = await tx
                .update(schema.matches)
                .set({
                courtName: effectiveCourtName,
                courtAddress: data.courtAddress !== undefined
                    ? data.courtAddress?.trim() || null
                    : existing.courtAddress,
                refereeId: data.refereeId !== undefined
                    ? data.refereeId || null
                    : existing.refereeId,
                scheduledAt: effectiveScheduledAt,
                ...(data.matchConfig !== undefined && {
                    matchConfig: data.matchConfig || {},
                }),
                updatedAt: new Date(),
                revision: (0, drizzle_orm_1.sql) `${schema.matches.revision} + 1`,
            })
                .where((0, drizzle_orm_1.eq)(schema.matches.id, id))
                .returning();
            if (existing && updated) {
                await this.auditService.logUpdate(tx, userId, 'matches', id, existing, updated);
            }
            return updated;
        });
    }
    async recordNonFinalOperation(id, userId, data) {
        const updated = await this.db.transaction(async (tx) => {
            const [existing] = await tx
                .select()
                .from(schema.matches)
                .where((0, drizzle_orm_1.eq)(schema.matches.id, id))
                .limit(1);
            if (!existing) {
                throw new common_1.NotFoundException('Match not found');
            }
            const [next] = await tx
                .update(schema.matches)
                .set({
                status: data.status,
                scoreDetails: data.scoreDetails,
                ...(data.p1SetsWon !== undefined && { p1SetsWon: data.p1SetsWon }),
                ...(data.p2SetsWon !== undefined && { p2SetsWon: data.p2SetsWon }),
                scheduledAt: data.scheduledAt !== undefined
                    ? data.scheduledAt
                    : existing.scheduledAt,
                startedAt: data.startedAt !== undefined ? data.startedAt : existing.startedAt,
                winnerId: data.winnerId !== undefined ? data.winnerId : existing.winnerId,
                updatedAt: new Date(),
                revision: (0, drizzle_orm_1.sql) `${schema.matches.revision} + 1`,
            })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.id, id), (0, drizzle_orm_1.ne)(schema.matches.status, 'COMPLETED')))
                .returning();
            if (!next) {
                throw new common_1.BadRequestException('Trận đấu đã kết thúc hoặc vừa được cập nhật bởi người khác.');
            }
            await this.auditService.logUpdate(tx, userId, 'matches', id, existing, next);
            return next;
        });
        return this.findById(updated.id);
    }
    async checkAllMatchesCompleted(tournamentId) {
        const activeMatches = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.matches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, tournamentId), (0, drizzle_orm_1.sql) `${schema.matches.status} != 'COMPLETED'`, (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)));
        return Number(activeMatches[0]?.count || 0) === 0;
    }
    async updateTournamentStatus(tournamentId, status) {
        await this.db
            .update(schema.tournaments)
            .set({ status: status, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId));
    }
    async isRefereeAccepted(tournamentId, refereeId) {
        const result = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.tournamentReferees)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentReferees.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentReferees.userId, refereeId), (0, drizzle_orm_1.eq)(schema.tournamentReferees.status, 'ACCEPTED')));
        return Number(result[0]?.count || 0) > 0;
    }
    async isTournamentManager(tournamentId, userId) {
        const [row] = await this.db
            .select({ id: schema.tournaments.id })
            .from(schema.tournaments)
            .leftJoin(schema.tournamentStaff, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStaff.tournamentId, schema.tournaments.id), (0, drizzle_orm_1.eq)(schema.tournamentStaff.userId, userId), (0, drizzle_orm_1.eq)(schema.tournamentStaff.role, 'CO_ORGANIZER')))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.tournaments.createdBy, userId), (0, drizzle_orm_1.eq)(schema.tournamentStaff.userId, userId))))
            .limit(1);
        return Boolean(row);
    }
    async getMutedUserIds(matchId) {
        const rows = await this.db
            .select({ userId: schema.matchMutedUsers.userId })
            .from(schema.matchMutedUsers)
            .where((0, drizzle_orm_1.eq)(schema.matchMutedUsers.matchId, matchId));
        return rows.map((r) => r.userId);
    }
    async getMutedUsers(matchId) {
        return this.db
            .select({
            id: schema.matchMutedUsers.id,
            userId: schema.matchMutedUsers.userId,
            type: schema.matchMutedUsers.type,
            reason: schema.matchMutedUsers.reason,
            expiresAt: schema.matchMutedUsers.expiresAt,
            createdAt: schema.matchMutedUsers.createdAt,
            mutedBy: schema.matchMutedUsers.mutedBy,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
        })
            .from(schema.matchMutedUsers)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.matchMutedUsers.userId, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.matchMutedUsers.matchId, matchId));
    }
    async muteUser(matchId, userId, type, reason, mutedBy) {
        const [existing] = await this.db
            .select()
            .from(schema.matchMutedUsers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matchMutedUsers.matchId, matchId), (0, drizzle_orm_1.eq)(schema.matchMutedUsers.userId, userId)))
            .limit(1);
        if (existing) {
            const [updated] = await this.db
                .update(schema.matchMutedUsers)
                .set({ type, reason, mutedBy })
                .where((0, drizzle_orm_1.eq)(schema.matchMutedUsers.id, existing.id))
                .returning();
            return updated;
        }
        const [created] = await this.db
            .insert(schema.matchMutedUsers)
            .values({ matchId, userId, type, reason, mutedBy })
            .returning();
        return created;
    }
    async unmuteUser(matchId, userId) {
        const [deleted] = await this.db
            .delete(schema.matchMutedUsers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matchMutedUsers.matchId, matchId), (0, drizzle_orm_1.eq)(schema.matchMutedUsers.userId, userId)))
            .returning();
        return deleted;
    }
    async getFollowerUserIds(tournamentId) {
        const rows = await this.db
            .select({ userId: schema.tournamentFollows.userId })
            .from(schema.tournamentFollows)
            .where((0, drizzle_orm_1.eq)(schema.tournamentFollows.tournamentId, tournamentId));
        return rows.map((r) => r.userId);
    }
    async incrementCheerCount(id) {
        const [updated] = await this.db
            .update(schema.matches)
            .set({
            cheerCount: (0, drizzle_orm_1.sql) `${schema.matches.cheerCount} + 1`,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.matches.id, id))
            .returning({
            id: schema.matches.id,
            cheerCount: schema.matches.cheerCount,
        });
        return updated ?? null;
    }
    async updateRefereeId(id, refereeId, userId) {
        return this.db.transaction(async (tx) => {
            const [updated] = await tx
                .update(schema.matches)
                .set({ refereeId, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.id, id), (0, drizzle_orm_1.isNull)(schema.matches.refereeId)))
                .returning();
            if (!updated) {
                return null;
            }
            await this.auditService.logUpdate(tx, userId, 'matches', id, { refereeId: null }, { refereeId });
            return updated;
        });
    }
};
exports.MatchesRepository = MatchesRepository;
exports.MatchesRepository = MatchesRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, audit_service_1.AuditService])
], MatchesRepository);
//# sourceMappingURL=matches.repository.js.map