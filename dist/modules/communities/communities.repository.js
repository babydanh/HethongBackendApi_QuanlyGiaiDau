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
exports.CommunitiesRepository = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const audit_service_1 = require("../audit/audit.service");
const cursor_pagination_helper_1 = require("../../common/helpers/cursor-pagination.helper");
const VIETNAMESE_DIACRITIC_CHARACTERS = 'ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴàáạảãâầấậẩẫăằắặẳẵÈÉẸẺẼÊỀẾỆỂỄèéẹẻẽêềếệểễÌÍỊỈĨìíịỉĩÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠòóọỏõôồốộổỗơờớợởỡÙÚỤỦŨƯỪỨỰỬỮùúụủũưừứựửữỲÝỴỶỸỳýỵỷỹĐđ';
const VIETNAMESE_ASCII_CHARACTERS = [
    'A'.repeat(17),
    'a'.repeat(17),
    'E'.repeat(11),
    'e'.repeat(11),
    'I'.repeat(5),
    'i'.repeat(5),
    'O'.repeat(17),
    'o'.repeat(17),
    'U'.repeat(11),
    'u'.repeat(11),
    'Y'.repeat(5),
    'y'.repeat(5),
    'Dd',
].join('');
let CommunitiesRepository = class CommunitiesRepository {
    db;
    auditService;
    constructor(db, auditService) {
        this.db = db;
        this.auditService = auditService;
    }
    async findAll(query) {
        const conditions = [(0, drizzle_orm_1.isNull)(schema.communities.deletedAt)];
        if (query.status) {
            conditions.push((0, drizzle_orm_1.eq)(schema.communities.status, query.status));
        }
        conditions.push((0, drizzle_orm_1.sql) `${schema.communities.visibility} != 'PRIVATE'`);
        if (query.search) {
            conditions.push((0, drizzle_orm_1.ilike)(schema.communities.name, `%${query.search}%`));
        }
        if (query.region) {
            conditions.push((0, drizzle_orm_1.ilike)(schema.communities.locationAddress, `%${query.region}%`));
        }
        if (query.provinceCode) {
            conditions.push((0, drizzle_orm_1.eq)(schema.communities.provinceCode, query.provinceCode));
        }
        if (query.categoryId) {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.categoryId);
            const subquery = this.db
                .select({ communityId: schema.communitySports.communityId })
                .from(schema.communitySports)
                .innerJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.communitySports.categoryId, schema.categories.id))
                .where(isUuid
                ? (0, drizzle_orm_1.eq)(schema.communitySports.categoryId, query.categoryId)
                : (0, drizzle_orm_1.eq)(schema.categories.slug, query.categoryId));
            conditions.push((0, drizzle_orm_1.sql) `${schema.communities.id} IN ${subquery}`);
        }
        if (query.lat !== undefined && query.lng !== undefined) {
            const radiusMeters = (query.radiusKm || 10) * 1000;
            const point = (0, drizzle_orm_1.sql) `ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)`;
            conditions.push((0, drizzle_orm_1.sql) `ST_DWithin(${schema.communities.locationGeolocation}, ${point}, ${radiusMeters})`);
        }
        const baseWhereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const decodedCursor = query.cursor
            ? cursor_pagination_helper_1.CursorPaginationHelper.decodeCursor(query.cursor)
            : null;
        if (decodedCursor) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.lt)(schema.communities.createdAt, new Date(decodedCursor.createdAt)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communities.createdAt, new Date(decodedCursor.createdAt)), (0, drizzle_orm_1.lt)(schema.communities.id, decodedCursor.id))));
        }
        const whereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.communities)
            .where(baseWhereClause);
        let dbQuery = this.db
            .select()
            .from(schema.communities)
            .where(whereClause)
            .$dynamic();
        const limit = query.limit ?? 10;
        dbQuery = dbQuery
            .orderBy((0, drizzle_orm_1.desc)(schema.communities.createdAt), (0, drizzle_orm_1.desc)(schema.communities.id))
            .limit(limit + 1);
        const rawCommunities = await dbQuery;
        const hasMore = rawCommunities.length > limit;
        const communitiesList = hasMore
            ? rawCommunities.slice(0, limit)
            : rawCommunities;
        if (communitiesList.length === 0) {
            return {
                data: [],
                meta: {
                    total: totalRecord.count,
                    page: query.page ?? 1,
                    limit,
                    totalPages: Math.ceil(totalRecord.count / limit),
                    nextCursor: null,
                    hasMore: false,
                },
            };
        }
        const communityIds = communitiesList.map((c) => c.id);
        const sportsLinks = await this.db
            .select({
            communityId: schema.communitySports.communityId,
            category: schema.categories,
        })
            .from(schema.communitySports)
            .innerJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.communitySports.categoryId, schema.categories.id))
            .where((0, drizzle_orm_1.sql) `${schema.communitySports.communityId} IN ${communityIds}`);
        const categoriesMap = {};
        sportsLinks.forEach((link) => {
            if (!categoriesMap[link.communityId]) {
                categoriesMap[link.communityId] = [];
            }
            categoriesMap[link.communityId].push(link.category);
        });
        const membersCount = await this.db
            .select({
            communityId: schema.communityMembers.communityId,
            count: (0, drizzle_orm_1.sql) `count(${schema.communityMembers.id})`,
        })
            .from(schema.communityMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${schema.communityMembers.communityId} IN ${communityIds}`, (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED')))
            .groupBy(schema.communityMembers.communityId);
        const membersCountMap = {};
        membersCount.forEach((mc) => {
            membersCountMap[mc.communityId] = Number(mc.count);
        });
        const tournamentsCount = await this.db
            .select({
            communityId: schema.tournaments.communityId,
            count: (0, drizzle_orm_1.sql) `count(${schema.tournaments.id})`,
        })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${schema.tournaments.communityId} IN ${communityIds}`, (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt), (0, drizzle_orm_1.sql) `${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED')`))
            .groupBy(schema.tournaments.communityId);
        const tournamentsCountMap = {};
        tournamentsCount.forEach((tc) => {
            if (tc.communityId) {
                tournamentsCountMap[tc.communityId] = Number(tc.count);
            }
        });
        const data = communitiesList.map((community) => ({
            ...community,
            categories: categoriesMap[community.id] || [],
            _count: {
                members: membersCountMap[community.id] || 0,
                tournaments: tournamentsCountMap[community.id] || 0,
            },
        }));
        const lastCommunity = communitiesList[communitiesList.length - 1];
        return {
            data,
            meta: {
                total: totalRecord.count,
                page: query.page ?? 1,
                limit,
                totalPages: Math.ceil(totalRecord.count / limit),
                nextCursor: hasMore
                    ? cursor_pagination_helper_1.CursorPaginationHelper.encodeCursor({
                        id: lastCommunity.id,
                        createdAt: lastCommunity.createdAt,
                    })
                    : null,
                hasMore,
            },
        };
    }
    async findMyCommunities(userId) {
        const created = await this.db
            .select({
            community: schema.communities,
            myRole: schema.communityMembers.role,
        })
            .from(schema.communities)
            .leftJoin(schema.communityMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communities.id, schema.communityMembers.communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communities.creatorId, userId), (0, drizzle_orm_1.eq)(schema.communities.status, 'ACTIVE'), (0, drizzle_orm_1.isNull)(schema.communities.deletedAt)));
        const joined = await this.db
            .select({
            community: schema.communities,
            myRole: schema.communityMembers.role,
        })
            .from(schema.communities)
            .innerJoin(schema.communityMembers, (0, drizzle_orm_1.eq)(schema.communities.id, schema.communityMembers.communityId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED'), (0, drizzle_orm_1.sql) `${schema.communities.creatorId} != ${userId}`, (0, drizzle_orm_1.eq)(schema.communities.status, 'ACTIVE'), (0, drizzle_orm_1.isNull)(schema.communities.deletedAt)));
        return {
            created: created.map((result) => ({
                ...result.community,
                myRole: result.myRole || 'OWNER',
            })),
            joined: joined.map((result) => ({
                ...result.community,
                myRole: result.myRole || 'MEMBER',
            })),
        };
    }
    async findById(id) {
        const records = await this.db
            .select()
            .from(schema.communities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communities.id, id), (0, drizzle_orm_1.isNull)(schema.communities.deletedAt)))
            .limit(1);
        if (records.length === 0) {
            return null;
        }
        const community = records[0];
        const [memberCount, tournamentCount] = await Promise.all([
            this.db
                .select({ count: (0, drizzle_orm_1.count)() })
                .from(schema.communityMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, id), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED'))),
            this.db
                .select({ count: (0, drizzle_orm_1.count)() })
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.communityId, id), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt), (0, drizzle_orm_1.sql) `${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED')`)),
        ]);
        const sportsLinks = await this.db
            .select({
            category: schema.categories,
        })
            .from(schema.communitySports)
            .innerJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.communitySports.categoryId, schema.categories.id))
            .where((0, drizzle_orm_1.eq)(schema.communitySports.communityId, id));
        return {
            ...community,
            categories: sportsLinks.map((link) => link.category),
            _count: {
                members: Number(memberCount[0]?.count ?? 0),
                tournaments: Number(tournamentCount[0]?.count ?? 0),
            },
        };
    }
    async create(data, lat, lng, categoryIds) {
        return await this.db.transaction(async (tx) => {
            const valuesToInsert = { ...data };
            if (lat !== undefined && lng !== undefined) {
                valuesToInsert.locationGeolocation = (0, drizzle_orm_1.sql) `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
            }
            const [community] = await tx
                .insert(schema.communities)
                .values(valuesToInsert)
                .returning();
            if (categoryIds && categoryIds.length > 0) {
                const sportLinks = categoryIds.map((categoryId) => ({
                    communityId: community.id,
                    categoryId,
                }));
                await tx.insert(schema.communitySports).values(sportLinks);
            }
            await tx.insert(schema.communityMembers).values({
                communityId: community.id,
                userId: data.creatorId,
                role: 'OWNER',
                status: 'JOINED',
            });
            return community;
        });
    }
    async update(id, data, lat, lng, categoryIds) {
        return await this.db.transaction(async (tx) => {
            const updateData = {
                ...data,
                updatedAt: new Date(),
            };
            if (lat !== undefined && lng !== undefined) {
                updateData.locationGeolocation = (0, drizzle_orm_1.sql) `ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
            }
            if (Object.keys(updateData).length > 1) {
                await tx
                    .update(schema.communities)
                    .set(updateData)
                    .where((0, drizzle_orm_1.eq)(schema.communities.id, id));
            }
            if (categoryIds !== undefined) {
                await tx
                    .delete(schema.communitySports)
                    .where((0, drizzle_orm_1.eq)(schema.communitySports.communityId, id));
                if (categoryIds.length > 0) {
                    const sportLinks = categoryIds.map((categoryId) => ({
                        communityId: id,
                        categoryId,
                    }));
                    await tx.insert(schema.communitySports).values(sportLinks);
                }
            }
            const [updated] = await tx
                .select()
                .from(schema.communities)
                .where((0, drizzle_orm_1.eq)(schema.communities.id, id))
                .limit(1);
            return updated;
        });
    }
    async delete(id) {
        const [deleted] = await this.db
            .update(schema.communities)
            .set({ deletedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.communities.id, id))
            .returning();
        return deleted;
    }
    async findMember(communityId, userId) {
        const records = await this.db
            .select()
            .from(schema.communityMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
            .limit(1);
        return records[0];
    }
    async findMyMembership(userId, communityId) {
        const [member] = await this.db
            .select()
            .from(schema.communityMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
            .limit(1);
        return member || null;
    }
    async getMembers(communityId, query) {
        const page = query?.page ?? 1;
        const limit = query?.limit ?? 50;
        const cursor = query?.cursor;
        const conditions = [
            (0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId),
        ];
        if (query?.status) {
            conditions.push((0, drizzle_orm_1.eq)(schema.communityMembers.status, query.status));
        }
        if (query?.mentionable) {
            conditions.push((0, drizzle_orm_1.isNull)(schema.users.deletedAt));
        }
        const search = query?.search?.trim();
        if (search) {
            const normalizedSearch = search
                .normalize('NFD')
                .replace(/\p{Diacritic}/gu, '')
                .replace(/đ/gu, 'd')
                .replace(/Đ/gu, 'D')
                .toLocaleLowerCase('vi-VN')
                .replace(/[\\%_]/g, '\\$&');
            conditions.push((0, drizzle_orm_1.sql) `
        lower(translate(
          ${schema.profiles.fullName},
          ${VIETNAMESE_DIACRITIC_CHARACTERS},
          ${VIETNAMESE_ASCII_CHARACTERS}
        )) LIKE ${`%${normalizedSearch}%`}
      `);
        }
        const baseWhereClause = (0, drizzle_orm_1.and)(...conditions);
        const decodedCursor = cursor
            ? cursor_pagination_helper_1.CursorPaginationHelper.decodeCursor(cursor)
            : null;
        if (decodedCursor) {
            const rolePriority = (0, drizzle_orm_1.sql) `CASE WHEN ${schema.communityMembers.role} IN ('OWNER', 'MODERATOR') THEN 0 ELSE 1 END`;
            const cursorRolePriority = decodedCursor.rolePriority ?? 1;
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.lt)(rolePriority, cursorRolePriority), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(rolePriority, cursorRolePriority), (0, drizzle_orm_1.lt)(schema.communityMembers.joinedAt, new Date(decodedCursor.joinedAt))), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(rolePriority, cursorRolePriority), (0, drizzle_orm_1.eq)(schema.communityMembers.joinedAt, new Date(decodedCursor.joinedAt)), (0, drizzle_orm_1.lt)(schema.communityMembers.id, decodedCursor.id))));
        }
        const whereClause = conditions.length > 1 ? (0, drizzle_orm_1.and)(...conditions) : conditions[0];
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.communityMembers)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityMembers.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where(baseWhereClause);
        const membersQuery = this.db
            .select({
            member: schema.communityMembers,
            user: {
                id: schema.users.id,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            },
        })
            .from(schema.communityMembers)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityMembers.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.sql) `CASE WHEN ${schema.communityMembers.role} IN ('OWNER', 'MODERATOR') THEN 0 ELSE 1 END`, (0, drizzle_orm_1.desc)(schema.communityMembers.joinedAt), (0, drizzle_orm_1.desc)(schema.communityMembers.id))
            .limit(limit + 1)
            .$dynamic();
        const rawData = await membersQuery;
        const hasMore = rawData.length > limit;
        const data = hasMore ? rawData.slice(0, limit) : rawData;
        return {
            data,
            meta: {
                total: totalRecord.count,
                page,
                limit,
                totalPages: Math.ceil(totalRecord.count / limit),
                nextCursor: hasMore && data.length > 0
                    ? cursor_pagination_helper_1.CursorPaginationHelper.encodeCursor({
                        id: data[data.length - 1].member.id,
                        joinedAt: data[data.length - 1].member.joinedAt,
                        rolePriority: ['OWNER', 'MODERATOR'].includes(data[data.length - 1].member.role)
                            ? 0
                            : 1,
                    })
                    : null,
                hasMore,
            },
        };
    }
    async findInvitesByUser(userId) {
        const rows = await this.db
            .select({
            id: schema.communityMembers.id,
            communityId: schema.communityMembers.communityId,
            communityName: schema.communities.name,
            communityAvatar: schema.communities.logoUrl,
            communityLogoUrl: schema.communities.logoUrl,
            communityBannerUrl: schema.communities.bannerUrl,
            inviterName: schema.profiles.fullName,
            inviterAvatar: schema.profiles.avatarUrl,
            role: schema.communityMembers.role,
            invitedAt: schema.communityMembers.joinedAt,
        })
            .from(schema.communityMembers)
            .innerJoin(schema.communities, (0, drizzle_orm_1.eq)(schema.communityMembers.communityId, schema.communities.id))
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityMembers.invitedBy, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'INVITED'), (0, drizzle_orm_1.isNull)(schema.communities.deletedAt)))
            .orderBy((0, drizzle_orm_1.sql) `${schema.communityMembers.joinedAt} DESC`);
        return rows.map((row) => ({
            ...row,
            inviterName: row.inviterName || 'Ban quản trị',
            inviterAvatar: row.inviterAvatar || null,
            createdAt: row.invitedAt,
            status: 'PENDING',
        }));
    }
    async addMember(communityId, userId, role, status = 'JOINED', joinAnswers, invitedBy) {
        const [member] = await this.db
            .insert(schema.communityMembers)
            .values({
            communityId,
            userId,
            role,
            status,
            joinAnswers,
            invitedBy,
        })
            .returning();
        return member;
    }
    async updateMemberStatus(communityId, userId, status, approvedBy) {
        const [member] = await this.db
            .update(schema.communityMembers)
            .set({
            status,
            ...(approvedBy ? { approvedBy, approvedAt: new Date() } : {}),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
            .returning();
        return member;
    }
    async updateMemberRole(communityId, userId, role) {
        const [member] = await this.db
            .update(schema.communityMembers)
            .set({ role })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
            .returning();
        return member;
    }
    async updateMemberTags(communityId, userId, tags, actorId) {
        return await this.db.transaction(async (tx) => {
            const [current] = await tx
                .select()
                .from(schema.communityMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
                .limit(1);
            if (!current) {
                return null;
            }
            const [member] = await tx
                .update(schema.communityMembers)
                .set({ tags })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
                .returning();
            await this.auditService.logUpdate(tx, actorId, 'community_members', current.id, { tags: current.tags ?? [] }, { tags: member?.tags ?? [] });
            return member;
        });
    }
    async transferOwnership(communityId, currentOwnerId, newOwnerId) {
        return await this.db.transaction(async (tx) => {
            await tx
                .update(schema.communityMembers)
                .set({ role: 'MODERATOR' })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, currentOwnerId)));
            await tx
                .update(schema.communityMembers)
                .set({ role: 'OWNER' })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, newOwnerId)));
            const [updatedCommunity] = await tx
                .update(schema.communities)
                .set({ creatorId: newOwnerId, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.communities.id, communityId))
                .returning();
            const [newOwnerMember] = await tx
                .select()
                .from(schema.communityMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, newOwnerId)))
                .limit(1);
            return newOwnerMember;
        });
    }
    async removeMember(communityId, userId) {
        const [member] = await this.db
            .delete(schema.communityMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
            .returning();
        return member;
    }
    async addFollow(communityId, userId, type) {
        const [record] = await this.db
            .insert(schema.communityFollows)
            .values({ communityId, userId, type })
            .onConflictDoNothing()
            .returning();
        return record;
    }
    async removeFollow(communityId, userId, type) {
        const [record] = await this.db
            .delete(schema.communityFollows)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityFollows.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityFollows.userId, userId), (0, drizzle_orm_1.eq)(schema.communityFollows.type, type)))
            .returning();
        return record;
    }
    async getFavorites(userId) {
        return await this.db
            .select({ community: schema.communities })
            .from(schema.communityFollows)
            .innerJoin(schema.communities, (0, drizzle_orm_1.eq)(schema.communityFollows.communityId, schema.communities.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityFollows.userId, userId), (0, drizzle_orm_1.eq)(schema.communityFollows.type, 'FAVORITE')));
    }
    async getGallery(communityId) {
        return await this.db
            .select()
            .from(schema.communityGallery)
            .where((0, drizzle_orm_1.eq)(schema.communityGallery.communityId, communityId))
            .orderBy((0, drizzle_orm_1.sql) `${schema.communityGallery.createdAt} DESC`);
    }
    async findGalleryItemById(communityId, imageId) {
        const [item] = await this.db
            .select()
            .from(schema.communityGallery)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityGallery.id, imageId), (0, drizzle_orm_1.eq)(schema.communityGallery.communityId, communityId)))
            .limit(1);
        return item || null;
    }
    async addGalleryItem(communityId, uploaderId, imageUrl, caption) {
        const [item] = await this.db
            .insert(schema.communityGallery)
            .values({
            communityId,
            uploaderId,
            imageUrl,
            caption,
        })
            .returning();
        return item;
    }
    async getTournaments(communityId, status) {
        let condition = (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.communityId, communityId), (0, drizzle_orm_1.eq)(schema.tournaments.visibility, 'PUBLIC'), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt), (0, drizzle_orm_1.sql) `${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED')`);
        if (status && status !== 'ALL') {
            condition = (0, drizzle_orm_1.and)(condition, (0, drizzle_orm_1.eq)(schema.tournaments.status, status));
        }
        return await this.db
            .select()
            .from(schema.tournaments)
            .where(condition)
            .orderBy((0, drizzle_orm_1.sql) `${schema.tournaments.createdAt} DESC`);
    }
    async getRankings(communityId, limit = 100) {
        return await this.db
            .select({
            rank: schema.communityRankings,
            user: {
                id: schema.users.id,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            },
        })
            .from(schema.communityRankings)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityRankings.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityRankings.communityId, communityId), (0, drizzle_orm_1.sql) `${schema.communityRankings.matchesPlayed} > 0`))
            .orderBy((0, drizzle_orm_1.sql) `${schema.communityRankings.eloPoints} DESC`)
            .limit(limit);
    }
    async getRecentMatches(communityId, limit = 3) {
        const matches = await this.db
            .select({
            id: schema.matches.id,
            scoreA: schema.matches.p1SetsWon,
            scoreB: schema.matches.p2SetsWon,
            status: schema.matches.status,
            playedAt: schema.matches.completedAt,
        })
            .from(schema.matches)
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.matches.tournamentId, schema.tournaments.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.communityId, communityId), (0, drizzle_orm_1.eq)(schema.matches.status, 'COMPLETED'), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)))
            .orderBy((0, drizzle_orm_1.desc)(schema.matches.completedAt))
            .limit(limit);
        if (matches.length === 0) {
            return [];
        }
        const matchIds = matches.map((m) => m.id);
        const players = await this.findMatchPlayers(matchIds);
        const playersByMatch = this.groupMatchPlayers(players);
        return matches.map((match) => {
            const matchPlayers = playersByMatch.get(match.id) || [];
            const eloDelta = matchPlayers.reduce((max, player) => {
                const delta = player.changedPoints ?? 0;
                return Math.abs(delta) > Math.abs(max) ? delta : max;
            }, 0);
            return {
                id: match.id,
                playerA: this.toDashboardPlayer(matchPlayers.slice(0, 2)),
                playerB: this.toDashboardPlayer(matchPlayers.slice(2, 4)),
                scoreA: match.scoreA,
                scoreB: match.scoreB,
                status: match.status,
                eloDelta,
                playedAt: match.playedAt,
            };
        });
    }
    async getUpcomingMatches(communityId, limit = 3) {
        const matches = await this.db
            .select({
            id: schema.matches.id,
            scheduledAt: schema.matches.scheduledAt,
        })
            .from(schema.matches)
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.matches.tournamentId, schema.tournaments.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.communityId, communityId), (0, drizzle_orm_1.eq)(schema.matches.status, 'SCHEDULED'), (0, drizzle_orm_1.gte)(schema.matches.scheduledAt, new Date()), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)))
            .orderBy(schema.matches.scheduledAt)
            .limit(limit);
        if (matches.length === 0) {
            return [];
        }
        const matchIds = matches.map((m) => m.id);
        const players = await this.findMatchPlayers(matchIds);
        const playersByMatch = this.groupMatchPlayers(players);
        return matches.map((match) => {
            const matchPlayers = playersByMatch.get(match.id) || [];
            return {
                id: match.id,
                playerA: this.toDashboardPlayer(matchPlayers.slice(0, 2)),
                playerB: this.toDashboardPlayer(matchPlayers.slice(2, 4)),
                scheduledAt: match.scheduledAt,
            };
        });
    }
    async getFeaturedTournament(communityId) {
        const [tournament] = await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.communityId, communityId), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt), (0, drizzle_orm_1.sql) `${schema.tournaments.status} NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE')`))
            .orderBy((0, drizzle_orm_1.desc)(schema.tournaments.createdAt))
            .limit(1);
        if (!tournament) {
            return null;
        }
        const [participantCountResult] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournament.id));
        return {
            id: tournament.id,
            name: tournament.name,
            status: tournament.status,
            participantCount: Number(participantCountResult?.count ?? 0),
            championName: await this.findTournamentChampionName(tournament.id),
        };
    }
    async getTopRanked(communityId, limit = 3) {
        const rows = await this.db
            .select({
            userId: schema.communityRankings.userId,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
            elo: schema.communityRankings.eloPoints,
            tierName: schema.eloTiers.name,
            winStreak: schema.communityRankings.winStreak,
        })
            .from(schema.communityRankings)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityRankings.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .leftJoin(schema.eloTiers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityRankings.categoryId, schema.eloTiers.categoryId), (0, drizzle_orm_1.lte)(schema.eloTiers.minElo, schema.communityRankings.eloPoints), (0, drizzle_orm_1.gte)(schema.eloTiers.maxElo, schema.communityRankings.eloPoints)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityRankings.communityId, communityId), (0, drizzle_orm_1.sql) `${schema.communityRankings.matchesPlayed} > 0`))
            .orderBy((0, drizzle_orm_1.desc)(schema.communityRankings.eloPoints))
            .limit(limit);
        return rows.map((row, index) => ({ ...row, rank: index + 1 }));
    }
    async getActivityFeed(communityId, limit = 5) {
        const [memberJoins, galleryAdds, tournamentCreates] = await Promise.all([
            this.db
                .select({
                userId: schema.communityMembers.userId,
                userName: schema.profiles.fullName,
                at: schema.communityMembers.joinedAt,
            })
                .from(schema.communityMembers)
                .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityMembers.userId, schema.users.id))
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED')))
                .orderBy((0, drizzle_orm_1.desc)(schema.communityMembers.joinedAt))
                .limit(limit),
            this.db
                .select({
                userId: schema.communityGallery.uploaderId,
                userName: schema.profiles.fullName,
                at: schema.communityGallery.createdAt,
            })
                .from(schema.communityGallery)
                .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.communityGallery.uploaderId, schema.users.id))
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
                .where((0, drizzle_orm_1.eq)(schema.communityGallery.communityId, communityId))
                .orderBy((0, drizzle_orm_1.desc)(schema.communityGallery.createdAt))
                .limit(limit),
            this.db
                .select({
                userId: schema.tournaments.createdBy,
                userName: schema.profiles.fullName,
                at: schema.tournaments.createdAt,
            })
                .from(schema.tournaments)
                .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.tournaments.createdBy, schema.users.id))
                .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.communityId, communityId), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
                .orderBy((0, drizzle_orm_1.desc)(schema.tournaments.createdAt))
                .limit(limit),
        ]);
        return [
            ...memberJoins.map((item) => ({
                type: 'MEMBER_JOINED',
                userId: item.userId,
                userName: item.userName || 'Thành viên',
                message: 'gia nhập CLB',
                at: item.at,
            })),
            ...galleryAdds.map((item) => ({
                type: 'GALLERY_ADDED',
                userId: item.userId,
                userName: item.userName || 'Thành viên',
                message: 'đã thêm ảnh vào thư viện',
                at: item.at,
            })),
            ...tournamentCreates.map((item) => ({
                type: 'TOURNAMENT_CREATED',
                userId: item.userId,
                userName: item.userName || 'Thành viên',
                message: 'đã tạo giải đấu',
                at: item.at,
            })),
        ]
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
            .slice(0, limit);
    }
    async findMatchPlayers(matchIds) {
        return await this.db
            .select({
            matchId: schema.matchPlayers.matchId,
            userId: schema.users.id,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
            changedPoints: schema.eloHistoryLogs.changedPoints,
        })
            .from(schema.matchPlayers)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.matchPlayers.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .leftJoin(schema.eloHistoryLogs, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.eloHistoryLogs.matchId, schema.matchPlayers.matchId), (0, drizzle_orm_1.eq)(schema.eloHistoryLogs.userId, schema.matchPlayers.userId)))
            .where((0, drizzle_orm_1.inArray)(schema.matchPlayers.matchId, matchIds));
    }
    groupMatchPlayers(players) {
        const playersByMatch = new Map();
        players.forEach((player) => {
            const list = playersByMatch.get(player.matchId) || [];
            list.push(player);
            playersByMatch.set(player.matchId, list);
        });
        return playersByMatch;
    }
    toDashboardPlayer(players) {
        if (players.length === 0) {
            return null;
        }
        return {
            id: players[0].userId,
            fullName: players.map((p) => p.fullName || 'VĐV').join(' & '),
            avatarUrl: players[0].avatarUrl,
        };
    }
    async findTournamentChampionName(tournamentId) {
        const [finalMatch] = await this.db
            .select({ winnerId: schema.matches.winnerId })
            .from(schema.matches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.matches.status, 'COMPLETED'), (0, drizzle_orm_1.sql) `${schema.matches.winnerId} IS NOT NULL`))
            .orderBy((0, drizzle_orm_1.desc)(schema.matches.roundNumber), (0, drizzle_orm_1.desc)(schema.matches.matchOrder))
            .limit(1);
        if (!finalMatch?.winnerId) {
            return null;
        }
        const [winner] = await this.db
            .select({ teamName: schema.tournamentParticipants.teamName })
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, finalMatch.winnerId))
            .limit(1);
        if (!winner) {
            return null;
        }
        const [rosterMember] = await this.db
            .select({ fullName: schema.profiles.fullName })
            .from(schema.tournamentRosters)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, finalMatch.winnerId), (0, drizzle_orm_1.eq)(schema.tournamentRosters.role, 'MAIN')))
            .limit(1);
        return rosterMember?.fullName || winner.teamName || null;
    }
    async removeGalleryItem(communityId, imageId) {
        const [item] = await this.db
            .delete(schema.communityGallery)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityGallery.id, imageId), (0, drizzle_orm_1.eq)(schema.communityGallery.communityId, communityId)))
            .returning();
        return item;
    }
    async getMatchResultStreaks(communityId, userIds) {
        if (userIds.length === 0)
            return [];
        const userIdsArray = (0, drizzle_orm_1.sql) `ARRAY[${drizzle_orm_1.sql.join(userIds.map((userId) => (0, drizzle_orm_1.sql) `${userId}::uuid`), (0, drizzle_orm_1.sql) `, `)}]::uuid[]`;
        const rows = (await this.db.execute((0, drizzle_orm_1.sql) `
      WITH user_matches AS (
        SELECT
          mp.user_id AS "userId",
          (m.winner_id = mp.participant_id) AS won,
          m.completed_at AS "completedAt",
          m.id AS "matchId"
        FROM match_players mp
        INNER JOIN matches m ON m.id = mp.match_id
        INNER JOIN tournaments t ON t.id = m.tournament_id
        WHERE t.community_id = ${communityId}
          AND m.status = 'COMPLETED'
          AND m.deleted_at IS NULL
          AND m.winner_id IS NOT NULL
          AND mp.user_id = ANY(${userIdsArray})
      ),
      ordered AS (
        SELECT "userId", won,
          ROW_NUMBER() OVER (
            PARTITION BY "userId" ORDER BY "completedAt" DESC, "matchId" DESC
          ) AS rn
        FROM user_matches
      ),
      groups AS (
        SELECT "userId", won, rn,
          rn - ROW_NUMBER() OVER (PARTITION BY "userId", won ORDER BY rn) AS grp
        FROM ordered
      )
      SELECT DISTINCT ON ("userId")
        "userId",
        won,
        COUNT(*) OVER (PARTITION BY "userId", grp)::int AS streak
      FROM groups
      ORDER BY "userId", rn
    `));
        return rows.map((row) => ({
            userId: String(row.userId),
            won: Boolean(row.won),
            streak: Number(row.streak),
        }));
    }
    async getWeeklyEloGains(communityId, userIds) {
        if (userIds.length === 0)
            return [];
        const userIdsArray = (0, drizzle_orm_1.sql) `ARRAY[${drizzle_orm_1.sql.join(userIds.map((userId) => (0, drizzle_orm_1.sql) `${userId}::uuid`), (0, drizzle_orm_1.sql) `, `)}]::uuid[]`;
        const rows = (await this.db.execute((0, drizzle_orm_1.sql) `
      SELECT elh.user_id AS "userId", SUM(elh.changed_points)::int AS gain
      FROM elo_history_logs elh
      INNER JOIN matches m ON m.id = elh.match_id
      INNER JOIN tournaments t ON t.id = m.tournament_id
      WHERE t.community_id = ${communityId}
        AND elh.user_id = ANY(${userIdsArray})
        AND elh.changed_points > 0
        AND elh.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY elh.user_id
    `));
        return rows.map((row) => ({
            userId: String(row.userId),
            gain: Number(row.gain),
        }));
    }
    async countActiveByCreator(creatorId) {
        const [result] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.communities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communities.creatorId, creatorId), (0, drizzle_orm_1.isNull)(schema.communities.deletedAt)));
        return result.count;
    }
    async listTagPresets(communityId) {
        return this.db.select().from(schema.communityTagPresets)
            .where((0, drizzle_orm_1.eq)(schema.communityTagPresets.communityId, communityId))
            .orderBy(schema.communityTagPresets.createdAt);
    }
    async createTagPreset(communityId, createdBy, name, color) {
        const [created] = await this.db.insert(schema.communityTagPresets)
            .values({ communityId, createdBy, name, color })
            .returning();
        return created;
    }
    async findTagPresetByName(communityId, name) {
        const [existing] = await this.db.select({ id: schema.communityTagPresets.id })
            .from(schema.communityTagPresets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityTagPresets.communityId, communityId), (0, drizzle_orm_1.sql) `lower(${schema.communityTagPresets.name}) = lower(${name})`))
            .limit(1);
        return existing;
    }
    async deleteTagPreset(communityId, presetId) {
        const [deleted] = await this.db.delete(schema.communityTagPresets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityTagPresets.id, presetId), (0, drizzle_orm_1.eq)(schema.communityTagPresets.communityId, communityId)))
            .returning();
        return deleted;
    }
    async updateMemberNotificationPreference(communityId, userId, preference) {
        const [updated] = await this.db
            .update(schema.communityMembers)
            .set({ notificationPreference: preference })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, communityId), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId)))
            .returning();
        return updated;
    }
    async getMyNotificationPreferences(userId) {
        const rows = await this.db
            .select({
            communityId: schema.communities.id,
            communityName: schema.communities.name,
            logoUrl: schema.communities.logoUrl,
            role: schema.communityMembers.role,
            notificationPreference: schema.communityMembers.notificationPreference,
        })
            .from(schema.communityMembers)
            .innerJoin(schema.communities, (0, drizzle_orm_1.eq)(schema.communityMembers.communityId, schema.communities.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED'), (0, drizzle_orm_1.isNull)(schema.communities.deletedAt)));
        return rows;
    }
};
exports.CommunitiesRepository = CommunitiesRepository;
exports.CommunitiesRepository = CommunitiesRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, audit_service_1.AuditService])
], CommunitiesRepository);
//# sourceMappingURL=communities.repository.js.map