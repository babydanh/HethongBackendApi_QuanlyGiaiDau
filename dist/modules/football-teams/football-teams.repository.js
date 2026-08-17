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
exports.FootballTeamsRepository = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const audit_service_1 = require("../audit/audit.service");
const football_team_limits_1 = require("./football-team-limits");
const ACTIVE_MEMBER_STATUSES = ['ACTIVE'];
let FootballTeamsRepository = class FootballTeamsRepository {
    db;
    auditService;
    constructor(db, auditService) {
        this.db = db;
        this.auditService = auditService;
    }
    async create(userId, dto) {
        return this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `SELECT pg_advisory_xact_lock(hashtext('football-team-limit'))`);
            const normalizedName = dto.name.trim();
            if (!normalizedName)
                throw new common_1.BadRequestException('Tên đội không được để trống.');
            const [creator] = await tx.select({ id: schema.users.id }).from(schema.users)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.id, userId), (0, drizzle_orm_1.isNull)(schema.users.deletedAt))).limit(1);
            if (!creator)
                throw new common_1.NotFoundException('Không tìm thấy tài khoản hoạt động.');
            const [category] = await tx.select({
                id: schema.categories.id,
                name: schema.categories.name,
                slug: schema.categories.slug,
                categoryConfig: schema.categories.categoryConfig,
            }).from(schema.categories)
                .where((0, drizzle_orm_1.eq)(schema.categories.id, dto.categoryId)).limit(1);
            if (!category)
                throw new common_1.NotFoundException('Không tìm thấy danh mục bóng đá.');
            const categoryText = `${category.name} ${category.slug}`.toLowerCase();
            const categoryConfig = category.categoryConfig || {};
            if (!/(football|soccer|bóng đá)/i.test(categoryText) || categoryConfig.isActive === false || categoryConfig.isActive === 'false') {
                throw new common_1.ConflictException('Chỉ được tạo đội trong danh mục bóng đá đang hoạt động.');
            }
            if (dto.communityId) {
                const [communityAccess] = await tx
                    .select({
                    id: schema.communities.id,
                    configuredCategoryId: schema.communitySports.categoryId,
                })
                    .from(schema.communities)
                    .innerJoin(schema.communityMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communityMembers.communityId, schema.communities.id), (0, drizzle_orm_1.eq)(schema.communityMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.communityMembers.status, 'JOINED')))
                    .leftJoin(schema.communitySports, (0, drizzle_orm_1.eq)(schema.communitySports.communityId, schema.communities.id))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communities.id, dto.communityId), (0, drizzle_orm_1.eq)(schema.communities.status, 'ACTIVE'), (0, drizzle_orm_1.isNull)(schema.communities.deletedAt)))
                    .limit(1);
                if (!communityAccess) {
                    throw new common_1.ForbiddenException('Bạn phải tham gia câu lạc bộ đang hoạt động trước khi gắn đội bóng vào đó.');
                }
                if (communityAccess.configuredCategoryId &&
                    communityAccess.configuredCategoryId !== dto.categoryId) {
                    throw new common_1.ConflictException('Đội bóng phải cùng môn thể thao với câu lạc bộ đã chọn.');
                }
            }
            const [duplicate] = await tx.select({ id: schema.footballTeams.id })
                .from(schema.footballTeams)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeams.categoryId, dto.categoryId), (0, drizzle_orm_1.eq)(schema.footballTeams.status, 'ACTIVE'), (0, drizzle_orm_1.sql) `lower(${schema.footballTeams.name}) = lower(${normalizedName})`, dto.communityId
                ? (0, drizzle_orm_1.eq)(schema.footballTeams.communityId, dto.communityId)
                : (0, drizzle_orm_1.isNull)(schema.footballTeams.communityId)))
                .limit(1);
            if (duplicate)
                throw new common_1.ConflictException('Tên đội đã được dùng trong danh mục này.');
            const [{ count: createdCount }] = await tx
                .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(schema.footballTeams)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeams.createdBy, userId), (0, drizzle_orm_1.eq)(schema.footballTeams.status, 'ACTIVE')));
            (0, football_team_limits_1.assertCanCreateActiveFootballTeam)(Number(createdCount));
            const [{ count }] = await tx
                .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                .from(schema.footballTeamMembers)
                .innerJoin(schema.footballTeams, (0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, schema.footballTeams.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'), (0, drizzle_orm_1.eq)(schema.footballTeams.status, 'ACTIVE'), (0, drizzle_orm_1.inArray)(schema.footballTeamMembers.role, ['CAPTAIN', 'MANAGER', 'PLAYER'])));
            (0, football_team_limits_1.assertCanJoinActiveFootballTeam)(Number(count));
            const [team] = await tx.insert(schema.footballTeams).values({
                name: normalizedName,
                categoryId: dto.categoryId,
                logoUrl: dto.logoUrl?.trim() || null,
                communityId: dto.communityId,
                createdBy: userId,
            }).returning();
            await tx.insert(schema.footballTeamMembers).values({
                teamId: team.id,
                userId,
                role: 'CAPTAIN',
                status: 'ACTIVE',
                joinedAt: new Date(),
            });
            return team;
        });
    }
    async listMine(userId) {
        const rows = await this.db.select({
            team: schema.footballTeams,
            membership: schema.footballTeamMembers,
            rank: schema.footballTeamRanks,
        }).from(schema.footballTeamMembers)
            .innerJoin(schema.footballTeams, (0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, schema.footballTeams.id))
            .innerJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.categories.id, schema.footballTeams.categoryId))
            .leftJoin(schema.footballTeamRanks, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamRanks.teamId, schema.footballTeams.id), (0, drizzle_orm_1.eq)(schema.footballTeamRanks.categoryId, schema.footballTeams.categoryId)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.inArray)(schema.footballTeamMembers.status, ACTIVE_MEMBER_STATUSES), (0, drizzle_orm_1.eq)(schema.footballTeams.status, 'ACTIVE'), (0, drizzle_orm_1.sql) `coalesce(${schema.categories.categoryConfig}->>'isActive', 'true') <> 'false'`))
            .orderBy((0, drizzle_orm_1.desc)(schema.footballTeams.updatedAt));
        return rows.map(({ team, membership, rank }) => ({ team, membership, rank }));
    }
    async findById(teamId) {
        const [team] = await this.db.select().from(schema.footballTeams).where((0, drizzle_orm_1.eq)(schema.footballTeams.id, teamId)).limit(1);
        if (!team)
            throw new common_1.NotFoundException('Không tìm thấy đội bóng.');
        const members = await this.db.select().from(schema.footballTeamMembers)
            .where((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId)).orderBy((0, drizzle_orm_1.desc)(schema.footballTeamMembers.createdAt));
        return { ...team, members };
    }
    async findMember(teamId, userId) {
        const [member] = await this.db.select().from(schema.footballTeamMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId))).limit(1);
        return member;
    }
    async searchMemberCandidates(teamId, query, limit) {
        const activeBan = this.db.select({ id: schema.userBans.id })
            .from(schema.userBans)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userBans.userId, schema.users.id), (0, drizzle_orm_1.eq)(schema.userBans.isActive, true), (0, drizzle_orm_1.inArray)(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema.userBans.expiresAt), (0, drizzle_orm_1.gt)(schema.userBans.expiresAt, new Date()))));
        return this.db.select({
            id: schema.users.id,
            email: schema.users.email,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
            membershipStatus: schema.footballTeamMembers.status,
        }).from(schema.users)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.profiles.userId, schema.users.id))
            .leftJoin(schema.footballTeamMembers, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, schema.users.id), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(schema.users.deletedAt), (0, drizzle_orm_1.eq)(schema.users.isMock, false), (0, drizzle_orm_1.notExists)(activeBan), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema.users.email, `%${query}%`), (0, drizzle_orm_1.ilike)(schema.profiles.fullName, `%${query}%`))))
            .limit(Math.min(limit, 20));
    }
    async update(teamId, dto) {
        return this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `SELECT pg_advisory_xact_lock(hashtext('football-team-limit'))`);
            const [current] = await tx.select({
                id: schema.footballTeams.id,
                name: schema.footballTeams.name,
                categoryId: schema.footballTeams.categoryId,
                communityId: schema.footballTeams.communityId,
                createdBy: schema.footballTeams.createdBy,
                status: schema.footballTeams.status,
            }).from(schema.footballTeams).where((0, drizzle_orm_1.eq)(schema.footballTeams.id, teamId)).limit(1);
            if (!current)
                throw new common_1.NotFoundException('Không tìm thấy đội bóng.');
            const normalizedName = dto.name?.trim();
            if (dto.name !== undefined && !normalizedName) {
                throw new common_1.BadRequestException('Tên đội không được để trống.');
            }
            const nextStatus = dto.status ?? current.status;
            if (nextStatus === 'ACTIVE' && current.status !== 'ACTIVE') {
                const [{ count: activeCreatedCount }] = await tx
                    .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                    .from(schema.footballTeams)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeams.createdBy, current.createdBy), (0, drizzle_orm_1.eq)(schema.footballTeams.status, 'ACTIVE')));
                (0, football_team_limits_1.assertCanCreateActiveFootballTeam)(Number(activeCreatedCount));
            }
            if (normalizedName && nextStatus === 'ACTIVE') {
                const [duplicate] = await tx.select({ id: schema.footballTeams.id })
                    .from(schema.footballTeams)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.ne)(schema.footballTeams.id, teamId), (0, drizzle_orm_1.eq)(schema.footballTeams.categoryId, current.categoryId), (0, drizzle_orm_1.eq)(schema.footballTeams.status, 'ACTIVE'), (0, drizzle_orm_1.sql) `lower(${schema.footballTeams.name}) = lower(${normalizedName})`, current.communityId
                    ? (0, drizzle_orm_1.eq)(schema.footballTeams.communityId, current.communityId)
                    : (0, drizzle_orm_1.isNull)(schema.footballTeams.communityId)))
                    .limit(1);
                if (duplicate)
                    throw new common_1.ConflictException('Tên đội đã được dùng trong danh mục này.');
            }
            const [team] = await tx.update(schema.footballTeams).set({
                ...(normalizedName !== undefined ? { name: normalizedName } : {}),
                ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl?.trim() || null } : {}),
                ...(dto.status !== undefined ? { status: dto.status, archivedAt: dto.status === 'ARCHIVED' ? new Date() : null } : {}),
                updatedAt: new Date(),
            }).where((0, drizzle_orm_1.eq)(schema.footballTeams.id, teamId)).returning();
            return team;
        });
    }
    async invite(teamId, invitedBy, userId, role) {
        return this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `SELECT pg_advisory_xact_lock(hashtext('football-team-limit'))`);
            const [team] = await tx.select({ id: schema.footballTeams.id, status: schema.footballTeams.status })
                .from(schema.footballTeams).where((0, drizzle_orm_1.eq)(schema.footballTeams.id, teamId)).limit(1);
            if (!team)
                throw new common_1.NotFoundException('Không tìm thấy đội bóng.');
            if (team.status !== 'ACTIVE')
                throw new common_1.ConflictException('Đội bóng không còn nhận thành viên.');
            const activeBan = tx.select({ id: schema.userBans.id })
                .from(schema.userBans)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userBans.userId, schema.users.id), (0, drizzle_orm_1.eq)(schema.userBans.isActive, true), (0, drizzle_orm_1.inArray)(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema.userBans.expiresAt), (0, drizzle_orm_1.gt)(schema.userBans.expiresAt, new Date()))));
            const [target] = await tx.select({ id: schema.users.id }).from(schema.users)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.id, userId), (0, drizzle_orm_1.isNull)(schema.users.deletedAt), (0, drizzle_orm_1.eq)(schema.users.isMock, false), (0, drizzle_orm_1.notExists)(activeBan))).limit(1);
            if (!target)
                throw new common_1.NotFoundException('Tài khoản được mời không còn đủ điều kiện.');
            const [existing] = await tx.select().from(schema.footballTeamMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId))).limit(1);
            if (existing?.status === 'ACTIVE' || existing?.status === 'INVITED')
                throw new common_1.ConflictException('Thành viên đã có trong đội hoặc đang chờ mời.');
            const [{ count }] = await tx.select({ count: (0, drizzle_orm_1.sql) `count(*)::int` }).from(schema.footballTeamMembers)
                .innerJoin(schema.footballTeams, (0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, schema.footballTeams.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'), (0, drizzle_orm_1.eq)(schema.footballTeams.status, 'ACTIVE')));
            (0, football_team_limits_1.assertCanJoinActiveFootballTeam)(Number(count));
            if (existing) {
                const [member] = await tx.update(schema.footballTeamMembers).set({ status: 'INVITED', role, invitedBy, leftAt: null, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema.footballTeamMembers.id, existing.id)).returning();
                await tx.insert(schema.footballTeamInvites).values({ teamId, userId, invitedBy, status: 'PENDING' });
                await this.auditService.logUpdate(tx, invitedBy, 'football_team_members', existing.id, existing, member);
                return member;
            }
            const [member] = await tx.insert(schema.footballTeamMembers).values({ teamId, userId, role, status: 'INVITED', invitedBy }).returning();
            await tx.insert(schema.footballTeamInvites).values({ teamId, userId, invitedBy, status: 'PENDING' });
            await this.auditService.logCreate(tx, invitedBy, 'football_team_members', member.id, member);
            return member;
        });
    }
    async respond(teamId, userId, status) {
        return this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `SELECT pg_advisory_xact_lock(hashtext('football-team-limit'))`);
            const [team] = await tx.select({ status: schema.footballTeams.status }).from(schema.footballTeams)
                .where((0, drizzle_orm_1.eq)(schema.footballTeams.id, teamId)).limit(1);
            if (!team)
                throw new common_1.NotFoundException('Không tìm thấy đội bóng.');
            if (team.status !== 'ACTIVE' && status === 'ACCEPTED')
                throw new common_1.ConflictException('Đội bóng không còn nhận thành viên.');
            if (status === 'ACCEPTED') {
                const activeBan = tx.select({ id: schema.userBans.id })
                    .from(schema.userBans)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userBans.userId, schema.users.id), (0, drizzle_orm_1.eq)(schema.userBans.isActive, true), (0, drizzle_orm_1.inArray)(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema.userBans.expiresAt), (0, drizzle_orm_1.gt)(schema.userBans.expiresAt, new Date()))));
                const [target] = await tx.select({ id: schema.users.id }).from(schema.users)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.id, userId), (0, drizzle_orm_1.isNull)(schema.users.deletedAt), (0, drizzle_orm_1.eq)(schema.users.isMock, false), (0, drizzle_orm_1.notExists)(activeBan))).limit(1);
                if (!target)
                    throw new common_1.ConflictException('Tài khoản không còn đủ điều kiện tham gia đội.');
                const [{ count }] = await tx.select({ count: (0, drizzle_orm_1.sql) `count(*)::int` }).from(schema.footballTeamMembers)
                    .innerJoin(schema.footballTeams, (0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, schema.footballTeams.id))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'), (0, drizzle_orm_1.eq)(schema.footballTeams.status, 'ACTIVE')));
                (0, football_team_limits_1.assertCanJoinActiveFootballTeam)(Number(count));
            }
            const [before] = await tx.select().from(schema.footballTeamMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'INVITED')))
                .limit(1);
            const [member] = await tx.update(schema.footballTeamMembers).set({ status: status === 'ACCEPTED' ? 'ACTIVE' : 'DECLINED', joinedAt: status === 'ACCEPTED' ? new Date() : null, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'INVITED'))).returning();
            if (!member)
                throw new common_1.NotFoundException('Không tìm thấy lời mời đội bóng.');
            await tx.update(schema.footballTeamInvites).set({ status, respondedAt: new Date() }).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamInvites.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamInvites.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamInvites.status, 'PENDING')));
            if (before)
                await this.auditService.logUpdate(tx, userId, 'football_team_members', before.id, before, member);
            return member;
        });
    }
    async cancelInvite(teamId, userId) {
        return this.db.transaction(async (tx) => {
            const [before] = await tx.select().from(schema.footballTeamMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'INVITED')))
                .limit(1);
            const [member] = await tx.update(schema.footballTeamMembers).set({
                status: 'REMOVED',
                leftAt: new Date(),
                updatedAt: new Date(),
            }).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'INVITED'))).returning();
            if (!member)
                throw new common_1.NotFoundException('Không tìm thấy lời mời đang chờ.');
            await tx.update(schema.footballTeamInvites).set({
                status: 'CANCELLED',
                respondedAt: new Date(),
            }).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamInvites.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamInvites.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamInvites.status, 'PENDING')));
            if (before)
                await this.auditService.logUpdate(tx, before.invitedBy, 'football_team_members', before.id, before, member);
            return member;
        });
    }
    async removeMember(teamId, userId, actorUserId) {
        return this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `SELECT pg_advisory_xact_lock(hashtext(${`football-team-role:${teamId}`}))`);
            const [member] = await tx.select().from(schema.footballTeamMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'))).limit(1);
            if (!member)
                throw new common_1.NotFoundException('Không tìm thấy thành viên đang hoạt động.');
            if (member.role === 'CAPTAIN') {
                const [{ count }] = await tx.select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
                    .from(schema.footballTeamMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.role, 'CAPTAIN')));
                if (Number(count) <= 1)
                    throw new common_1.ConflictException('Đội phải có ít nhất một đội trưởng.');
            }
            const [updated] = await tx.update(schema.footballTeamMembers).set({
                status: 'REMOVED',
                leftAt: new Date(),
                updatedAt: new Date(),
            }).where((0, drizzle_orm_1.eq)(schema.footballTeamMembers.id, member.id)).returning();
            await this.auditService.logUpdate(tx, actorUserId, 'football_team_members', member.id, member, updated);
            return updated;
        });
    }
    async updateMember(teamId, userId, role, actorUserId) {
        return this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `SELECT pg_advisory_xact_lock(hashtext('football-team-role'))`);
            const [target] = await tx.select().from(schema.footballTeamMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'))).limit(1);
            if (!target)
                throw new common_1.NotFoundException('Không tìm thấy thành viên đang hoạt động.');
            if (target.role === 'CAPTAIN' && role !== 'CAPTAIN') {
                const [{ count }] = await tx.select({ count: (0, drizzle_orm_1.sql) `count(*)::int` }).from(schema.footballTeamMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.role, 'CAPTAIN')));
                if (Number(count) <= 1)
                    throw new common_1.ConflictException('Đội phải có ít nhất một đội trưởng.');
            }
            const [member] = await tx.update(schema.footballTeamMembers).set({ role, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.footballTeamMembers.id, target.id)).returning();
            await this.auditService.logUpdate(tx, actorUserId, 'football_team_members', target.id, target, member);
            return member;
        });
    }
    async leave(teamId, userId) {
        return this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `SELECT pg_advisory_xact_lock(hashtext('football-team-role'))`);
            const [member] = await tx.select().from(schema.footballTeamMembers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.userId, userId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'))).limit(1);
            if (!member)
                throw new common_1.NotFoundException('Không tìm thấy thành viên đang hoạt động.');
            if (member.role === 'CAPTAIN') {
                const [{ count }] = await tx.select({ count: (0, drizzle_orm_1.sql) `count(*)::int` }).from(schema.footballTeamMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.footballTeamMembers.teamId, teamId), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.status, 'ACTIVE'), (0, drizzle_orm_1.eq)(schema.footballTeamMembers.role, 'CAPTAIN')));
                if (Number(count) <= 1)
                    throw new common_1.ConflictException('Đội phải có ít nhất một đội trưởng.');
            }
            const [updated] = await tx.update(schema.footballTeamMembers).set({ status: 'LEFT', leftAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.footballTeamMembers.id, member.id)).returning();
            await this.auditService.logUpdate(tx, userId, 'football_team_members', member.id, member, updated);
            return updated;
        });
    }
};
exports.FootballTeamsRepository = FootballTeamsRepository;
exports.FootballTeamsRepository = FootballTeamsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, audit_service_1.AuditService])
], FootballTeamsRepository);
//# sourceMappingURL=football-teams.repository.js.map