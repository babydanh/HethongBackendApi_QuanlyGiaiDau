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
exports.UsersRepository = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const query_user_dto_1 = require("./dto/query-user.dto");
const cursor_pagination_helper_1 = require("../../common/helpers/cursor-pagination.helper");
const audit_service_1 = require("../audit/audit.service");
const enums_1 = require("../../common/constants/enums");
let UsersRepository = class UsersRepository {
    db;
    auditService;
    constructor(db, auditService) {
        this.db = db;
        this.auditService = auditService;
    }
    async replaceSystemRoles(targetUserId, roleNames, actorId) {
        return this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `select pg_advisory_xact_lock(hashtext('system-role-admin-assignment'))`);
            const actorAdminAssignments = await tx
                .select({ userId: schema.userToRoles.userId })
                .from(schema.userToRoles)
                .innerJoin(schema.roles, (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, schema.roles.id))
                .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.userToRoles.userId, schema.users.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userToRoles.userId, actorId), (0, drizzle_orm_1.eq)(schema.roles.name, enums_1.UserRole.ADMIN), (0, drizzle_orm_1.isNull)(schema.users.deletedAt)))
                .for('update');
            if (actorAdminAssignments.length === 0) {
                throw new Error('ACTOR_NOT_ADMIN');
            }
            const [target] = await tx
                .select({ id: schema.users.id })
                .from(schema.users)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.id, targetUserId), (0, drizzle_orm_1.isNull)(schema.users.deletedAt)))
                .for('update')
                .limit(1);
            if (!target)
                return null;
            const requestedRoles = await tx
                .select({ id: schema.roles.id, name: schema.roles.name })
                .from(schema.roles)
                .where((0, drizzle_orm_1.inArray)(schema.roles.name, roleNames))
                .for('update');
            if (requestedRoles.length !== roleNames.length) {
                throw new Error('SYSTEM_ROLE_NOT_FOUND');
            }
            const currentAssignments = await tx
                .select({ roleId: schema.userToRoles.roleId, roleName: schema.roles.name })
                .from(schema.userToRoles)
                .innerJoin(schema.roles, (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, schema.roles.id))
                .where((0, drizzle_orm_1.eq)(schema.userToRoles.userId, targetUserId))
                .for('update');
            const currentRoleNames = currentAssignments.map((assignment) => assignment.roleName);
            const targetLosesAdmin = currentRoleNames.includes(enums_1.UserRole.ADMIN) && !roleNames.includes(enums_1.UserRole.ADMIN);
            if (targetLosesAdmin) {
                const adminAssignments = await tx
                    .select({ userId: schema.userToRoles.userId })
                    .from(schema.userToRoles)
                    .innerJoin(schema.roles, (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, schema.roles.id))
                    .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.userToRoles.userId, schema.users.id))
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.roles.name, enums_1.UserRole.ADMIN), (0, drizzle_orm_1.isNull)(schema.users.deletedAt), (0, drizzle_orm_1.sql) `not exists (
              select 1 from ${schema.userBans} active_ban
              where active_ban.user_id = ${schema.userToRoles.userId}
                and active_ban.is_active = true
                and active_ban.ban_type in ('SOFT_BAN', 'HARD_BAN')
                and (active_ban.expires_at is null or active_ban.expires_at > now())
            )`))
                    .for('update');
                const activeAdminUserIds = new Set(adminAssignments.map((assignment) => assignment.userId));
                if (activeAdminUserIds.has(targetUserId) && activeAdminUserIds.size <= 1) {
                    throw new Error('LAST_ADMIN');
                }
            }
            const requestedRoleIds = requestedRoles.map((role) => role.id);
            const currentRoleIds = currentAssignments.map((assignment) => assignment.roleId);
            const rolesToRemove = currentRoleIds.filter((roleId) => !requestedRoleIds.includes(roleId));
            const rolesToAdd = requestedRoleIds.filter((roleId) => !currentRoleIds.includes(roleId));
            if (rolesToRemove.length === 0 && rolesToAdd.length === 0) {
                return currentRoleNames;
            }
            if (rolesToRemove.length > 0) {
                await tx
                    .delete(schema.userToRoles)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userToRoles.userId, targetUserId), (0, drizzle_orm_1.inArray)(schema.userToRoles.roleId, rolesToRemove)));
            }
            if (rolesToAdd.length > 0) {
                await tx.insert(schema.userToRoles).values(rolesToAdd.map((roleId) => ({
                    userId: targetUserId,
                    roleId,
                    assignedBy: actorId,
                }))).onConflictDoNothing();
            }
            await tx
                .update(schema.sessions)
                .set({ isRevoked: true, revokedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.sessions.userId, targetUserId), (0, drizzle_orm_1.eq)(schema.sessions.isRevoked, false)));
            await this.auditService.logUpdate(tx, actorId, 'user_to_roles', targetUserId, { roles: currentRoleNames }, { roles: roleNames });
            return roleNames;
        });
    }
    async findAll(query) {
        const { page = 1, limit = 10, search, order, cursor, role, status, from, to } = query;
        let whereClause = (0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(schema.users.deletedAt), (0, drizzle_orm_1.eq)(schema.users.isMock, false));
        if (role) {
            whereClause = (0, drizzle_orm_1.and)(whereClause, (0, drizzle_orm_1.sql) `exists (
        select 1 from ${schema.userToRoles} ur
        inner join ${schema.roles} rr on ur.role_id = rr.id
        where ur.user_id = ${schema.users.id} and rr.name = ${role}
      )`);
        }
        const activeSanctionPredicate = (0, drizzle_orm_1.sql) `exists (
      select 1 from ${schema.userBans} current_ban
      where current_ban.user_id = ${schema.users.id}
        and current_ban.is_active = true
        and (current_ban.expires_at is null or current_ban.expires_at > now())
    )`;
        if (status === query_user_dto_1.AdminUserStatusFilter.BANNED) {
            whereClause = (0, drizzle_orm_1.and)(whereClause, activeSanctionPredicate);
        }
        else if (status === query_user_dto_1.AdminUserStatusFilter.ACTIVE) {
            whereClause = (0, drizzle_orm_1.and)(whereClause, (0, drizzle_orm_1.sql) `not ${activeSanctionPredicate}`);
        }
        if (from) {
            whereClause = (0, drizzle_orm_1.and)(whereClause, (0, drizzle_orm_1.gte)(schema.users.createdAt, new Date(`${from}T00:00:00.000Z`)));
        }
        if (to) {
            const inclusiveEnd = new Date(`${to}T00:00:00.000Z`);
            inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1);
            whereClause = (0, drizzle_orm_1.and)(whereClause, (0, drizzle_orm_1.lt)(schema.users.createdAt, inclusiveEnd));
        }
        if (search) {
            whereClause = (0, drizzle_orm_1.and)(whereClause, (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema.users.email, `%${search}%`), (0, drizzle_orm_1.ilike)(schema.profiles.fullName, `%${search}%`)));
        }
        const sortConfig = order === 'desc'
            ? (0, drizzle_orm_1.desc)(schema.users.createdAt)
            : (0, drizzle_orm_1.asc)(schema.users.createdAt);
        let cursorValue = null;
        if (cursor) {
            try {
                cursorValue = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
            }
            catch {
                cursorValue = null;
            }
        }
        let userWhere = whereClause;
        if (cursorValue) {
            const cursorDate = new Date(cursorValue.createdAt);
            const cursorPredicate = order === 'asc'
                ? (0, drizzle_orm_1.sql) `(${schema.users.createdAt} > ${cursorDate} OR (${schema.users.createdAt} = ${cursorDate} AND ${schema.users.id} > ${cursorValue.id}))`
                : (0, drizzle_orm_1.sql) `(${schema.users.createdAt} < ${cursorDate} OR (${schema.users.createdAt} = ${cursorDate} AND ${schema.users.id} < ${cursorValue.id}))`;
            userWhere = (0, drizzle_orm_1.and)(whereClause, cursorPredicate);
        }
        const userQuery = this.db
            .select({
            id: schema.users.id,
            email: schema.users.email,
            isEmailVerified: schema.users.isEmailVerified,
            createdAt: schema.users.createdAt,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
            isVerified: schema.profiles.isVerified,
        })
            .from(schema.users)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where(userWhere)
            .orderBy(sortConfig, order === 'desc' ? (0, drizzle_orm_1.desc)(schema.users.id) : (0, drizzle_orm_1.asc)(schema.users.id))
            .limit(limit + 1)
            .$dynamic();
        const userRows = await userQuery;
        const hasMore = userRows.length > limit;
        const data = hasMore ? userRows.slice(0, limit) : userRows;
        const lastUser = data[data.length - 1];
        const countResult = await this.db
            .select({ id: schema.users.id })
            .from(schema.users)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where(whereClause);
        const total = countResult.length;
        const roleRows = data.length > 0
            ? await this.db
                .select({ userId: schema.userToRoles.userId, roleName: schema.roles.name })
                .from(schema.userToRoles)
                .innerJoin(schema.roles, (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, schema.roles.id))
                .where((0, drizzle_orm_1.inArray)(schema.userToRoles.userId, data.map((row) => row.id)))
            : [];
        const rolesByUserId = new Map();
        roleRows.forEach((row) => {
            const rolesForUser = rolesByUserId.get(row.userId) ?? [];
            if (!rolesForUser.includes(row.roleName)) {
                rolesForUser.push(row.roleName);
            }
            rolesByUserId.set(row.userId, rolesForUser);
        });
        const activeBanRows = data.length > 0
            ? await this.db
                .select({
                userId: schema.userBans.userId,
                banType: schema.userBans.banType,
                reason: schema.userBans.reason,
                expiresAt: schema.userBans.expiresAt,
                createdAt: schema.userBans.createdAt,
                id: schema.userBans.id,
            })
                .from(schema.userBans)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.userBans.userId, data.map((row) => row.id)), (0, drizzle_orm_1.eq)(schema.userBans.isActive, true), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema.userBans.expiresAt), (0, drizzle_orm_1.gt)(schema.userBans.expiresAt, (0, drizzle_orm_1.sql) `now()`))))
                .orderBy((0, drizzle_orm_1.desc)(schema.userBans.createdAt), (0, drizzle_orm_1.desc)(schema.userBans.id))
            : [];
        const activeBanByUserId = new Map();
        for (const ban of activeBanRows) {
            if (!activeBanByUserId.has(ban.userId)) {
                activeBanByUserId.set(ban.userId, ban);
            }
        }
        const mappedData = data.map((row) => ({
            id: row.id,
            email: row.email,
            isEmailVerified: row.isEmailVerified,
            createdAt: row.createdAt,
            roles: rolesByUserId.get(row.id) ?? [],
            profile: {
                fullName: row.fullName || '',
                avatarUrl: row.avatarUrl || undefined,
                isVerified: row.isVerified || false,
            },
            activeBan: activeBanByUserId.get(row.id) ? {
                banType: activeBanByUserId.get(row.id).banType,
                reason: activeBanByUserId.get(row.id).reason || '',
                expiresAt: activeBanByUserId.get(row.id).expiresAt?.toISOString(),
            } : undefined,
        }));
        return {
            data: mappedData,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                nextCursor: hasMore && lastUser ? Buffer.from(JSON.stringify({ createdAt: lastUser.createdAt.toISOString(), id: lastUser.id })).toString('base64url') : null,
                hasMore,
            },
        };
    }
    async findById(id) {
        const result = await this.db
            .select({
            id: schema.users.id,
            email: schema.users.email,
            passwordHash: schema.users.passwordHash,
            isEmailVerified: schema.users.isEmailVerified,
            isPhoneVerified: schema.users.isPhoneVerified,
            createdAt: schema.users.createdAt,
            profile: schema.profiles,
        })
            .from(schema.users)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.eq)(schema.users.id, id))
            .limit(1);
        const user = result[0];
        if (!user)
            return null;
        const userRoles = await this.db
            .select({
            roleName: schema.roles.name,
        })
            .from(schema.userToRoles)
            .innerJoin(schema.roles, (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, schema.roles.id))
            .where((0, drizzle_orm_1.eq)(schema.userToRoles.userId, id));
        const rolesList = userRoles.map((r) => r.roleName);
        return {
            ...user,
            role: rolesList[0] || 'PLAYER',
            roles: rolesList,
        };
    }
    async updateProfile(userId, data) {
        return await this.db
            .update(schema.profiles)
            .set({ ...data, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.profiles.userId, userId))
            .returning();
    }
    async verifyEmail(userId) {
        return await this.db
            .update(schema.users)
            .set({ isEmailVerified: true, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.users.id, userId))
            .returning();
    }
    async verifyPhone(userId) {
        return await this.db
            .update(schema.users)
            .set({ isPhoneVerified: true, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.users.id, userId))
            .returning();
    }
    async updatePassword(userId, passwordHash) {
        return await this.db
            .update(schema.users)
            .set({ passwordHash, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.users.id, userId))
            .returning();
    }
    async softDelete(id) {
        return await this.db
            .update(schema.users)
            .set({ deletedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.users.id, id))
            .returning();
    }
    async getPublicProfile(userId) {
        const result = await this.db
            .select({
            id: schema.users.id,
            createdAt: schema.users.createdAt,
            isMock: schema.users.isMock,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
            coverUrl: schema.profiles.coverUrl,
            gender: schema.profiles.gender,
            bio: schema.profiles.bio,
            isVerified: schema.profiles.isVerified,
        })
            .from(schema.users)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.id, userId), (0, drizzle_orm_1.isNull)(schema.users.deletedAt)))
            .limit(1);
        const user = result[0];
        if (!user)
            return null;
        const ranks = await this.db
            .select({
            categoryId: schema.userRanks.categoryId,
            categoryName: schema.categories.name,
            matchType: schema.userRanks.matchType,
            eloPoints: schema.userRanks.eloPoints,
            matchesPlayed: schema.userRanks.matchesPlayed,
            matchesWon: schema.userRanks.matchesWon,
            winStreak: schema.userRanks.winStreak,
            tierName: schema.eloTiers.name,
        })
            .from(schema.userRanks)
            .innerJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.userRanks.categoryId, schema.categories.id))
            .leftJoin(schema.eloTiers, (0, drizzle_orm_1.eq)(schema.userRanks.tierId, schema.eloTiers.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userRanks.userId, userId), (0, drizzle_orm_1.isNull)(schema.userRanks.communityId)));
        const pairUser1 = (0, drizzle_orm_1.aliasedTable)(schema.users, 'public_pair_user1');
        const pairUser2 = (0, drizzle_orm_1.aliasedTable)(schema.users, 'public_pair_user2');
        const pairProfile1 = (0, drizzle_orm_1.aliasedTable)(schema.profiles, 'public_pair_profile1');
        const pairProfile2 = (0, drizzle_orm_1.aliasedTable)(schema.profiles, 'public_pair_profile2');
        const pairRanks = await this.db
            .select({
            id: schema.pairRanks.id,
            categoryId: schema.pairRanks.categoryId,
            categoryName: schema.categories.name,
            matchType: schema.pairRanks.matchType,
            eloPoints: schema.pairRanks.eloPoints,
            matchesPlayed: schema.pairRanks.matchesPlayed,
            matchesWon: schema.pairRanks.matchesWon,
            winStreak: schema.pairRanks.winStreak,
            updatedAt: schema.pairRanks.updatedAt,
            partnerId: (0, drizzle_orm_1.sql) `CASE WHEN ${schema.pairRanks.user1Id} = ${userId} THEN ${pairUser2.id} ELSE ${pairUser1.id} END`.as('partner_id'),
            partnerName: (0, drizzle_orm_1.sql) `CASE WHEN ${schema.pairRanks.user1Id} = ${userId} THEN ${pairProfile2.fullName} ELSE ${pairProfile1.fullName} END`.as('partner_name'),
            partnerAvatarUrl: (0, drizzle_orm_1.sql) `CASE WHEN ${schema.pairRanks.user1Id} = ${userId} THEN ${pairProfile2.avatarUrl} ELSE ${pairProfile1.avatarUrl} END`.as('partner_avatar_url'),
        })
            .from(schema.pairRanks)
            .innerJoin(schema.categories, (0, drizzle_orm_1.eq)(schema.pairRanks.categoryId, schema.categories.id))
            .innerJoin(pairUser1, (0, drizzle_orm_1.eq)(schema.pairRanks.user1Id, pairUser1.id))
            .innerJoin(pairUser2, (0, drizzle_orm_1.eq)(schema.pairRanks.user2Id, pairUser2.id))
            .leftJoin(pairProfile1, (0, drizzle_orm_1.eq)(pairUser1.id, pairProfile1.userId))
            .leftJoin(pairProfile2, (0, drizzle_orm_1.eq)(pairUser2.id, pairProfile2.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema.pairRanks.user1Id, userId), (0, drizzle_orm_1.eq)(schema.pairRanks.user2Id, userId)), (0, drizzle_orm_1.eq)(schema.pairRanks.scope, 'PUBLIC'), (0, drizzle_orm_1.isNull)(schema.pairRanks.communityId), (0, drizzle_orm_1.eq)(pairUser1.isMock, false), (0, drizzle_orm_1.eq)(pairUser2.isMock, false), (0, drizzle_orm_1.gt)(schema.pairRanks.matchesPlayed, 0)))
            .orderBy((0, drizzle_orm_1.desc)(schema.pairRanks.eloPoints));
        const activeRanks = ranks.filter((rank) => rank.matchesPlayed > 0);
        const activePairRanks = pairRanks.filter((rank) => rank.matchesPlayed > 0);
        const highlightRank = [...activeRanks.map((rank) => ({ ...rank, source: 'SINGLES' })), ...activePairRanks.map((rank) => ({ ...rank, source: 'DOUBLES' }))]
            .sort((a, b) => b.eloPoints - a.eloPoints || b.matchesPlayed - a.matchesPlayed)[0] ?? null;
        const userRoles = await this.db
            .select({
            roleName: schema.roles.name,
        })
            .from(schema.userToRoles)
            .innerJoin(schema.roles, (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, schema.roles.id))
            .where((0, drizzle_orm_1.eq)(schema.userToRoles.userId, userId));
        const rolesList = userRoles.map((r) => r.roleName);
        const achievements = await this.getPublicProfileAchievements(userId);
        return {
            ...user,
            role: rolesList[0] || 'PLAYER',
            roles: rolesList,
            ranks: user.isMock ? [] : ranks,
            pairRanks: user.isMock ? [] : pairRanks,
            highlightRank: user.isMock ? null : highlightRank,
            achievements,
        };
    }
    async getPublicProfileAchievements(userId) {
        const participations = await this.db
            .selectDistinct({
            tournamentId: schema.tournaments.id,
            tournamentName: schema.tournaments.name,
            tournamentStatus: schema.tournaments.status,
            isRanked: schema.tournaments.isRanked,
            startDate: schema.tournaments.startDate,
            endDate: schema.tournaments.endDate,
        })
            .from(schema.tournamentRosters)
            .innerJoin(schema.tournamentParticipants, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, schema.tournaments.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId), (0, drizzle_orm_1.eq)(schema.tournaments.isRanked, true), (0, drizzle_orm_1.eq)(schema.tournaments.status, 'COMPLETED'), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)));
        const achievements = [];
        for (const tournament of participations) {
            const stages = await this.db
                .select({
                id: schema.tournamentStages.id,
                order: schema.tournamentStages.order,
            })
                .from(schema.tournamentStages)
                .where((0, drizzle_orm_1.eq)(schema.tournamentStages.tournamentId, tournament.tournamentId))
                .orderBy((0, drizzle_orm_1.asc)(schema.tournamentStages.order));
            if (stages.length === 0)
                continue;
            const stageIds = stages.map((stage) => stage.id);
            const maxStageOrder = Math.max(...stages.map((stage) => stage.order));
            const matches = await this.db
                .select({
                id: schema.matches.id,
                stageId: schema.matches.stageId,
                stageOrder: schema.tournamentStages.order,
                participant1Id: schema.matches.participant1Id,
                participant2Id: schema.matches.participant2Id,
                winnerId: schema.matches.winnerId,
                status: schema.matches.status,
                completedAt: schema.matches.completedAt,
                isBye: schema.matches.isBye,
            })
                .from(schema.matches)
                .innerJoin(schema.tournamentStages, (0, drizzle_orm_1.eq)(schema.matches.stageId, schema.tournamentStages.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, tournament.tournamentId), (0, drizzle_orm_1.inArray)(schema.matches.stageId, stageIds)))
                .orderBy((0, drizzle_orm_1.asc)(schema.tournamentStages.order), (0, drizzle_orm_1.asc)(schema.matches.roundNumber), (0, drizzle_orm_1.asc)(schema.matches.matchOrder));
            const userParticipantIds = new Set((await this.db
                .select({ participantId: schema.tournamentRosters.participantId })
                .from(schema.tournamentRosters)
                .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.userId, userId))).map((row) => row.participantId));
            const userMatches = matches.filter((match) => userParticipantIds.has(match.participant1Id || '') ||
                userParticipantIds.has(match.participant2Id || ''));
            if (userMatches.length === 0)
                continue;
            const lastStageMatches = matches.filter((match) => match.stageOrder === maxStageOrder && match.status === 'COMPLETED');
            let finalMatches = lastStageMatches.filter((match) => {
                const p1InPrev = match.participant1Id ? userParticipantIds.has(match.participant1Id) : false;
                const p2InPrev = match.participant2Id ? userParticipantIds.has(match.participant2Id) : false;
                return p1InPrev || p2InPrev;
            });
            if (finalMatches.length === 0 && lastStageMatches.length === 1) {
                finalMatches = lastStageMatches;
            }
            const bronzeMatches = lastStageMatches.filter((match) => !finalMatches.some((finalMatch) => finalMatch.id === match.id));
            const userInMatch = (match) => {
                const inP1 = match.participant1Id ? userParticipantIds.has(match.participant1Id) : false;
                const inP2 = match.participant2Id ? userParticipantIds.has(match.participant2Id) : false;
                return {
                    inP1,
                    inP2,
                    isWinner: (inP1 && match.winnerId === match.participant1Id) ||
                        (inP2 && match.winnerId === match.participant2Id),
                };
            };
            const finalUserMatch = finalMatches.find((match) => {
                const state = userInMatch(match);
                return state.inP1 || state.inP2;
            });
            if (finalUserMatch) {
                const state = userInMatch(finalUserMatch);
                achievements.push({
                    tournamentId: tournament.tournamentId,
                    tournamentName: tournament.tournamentName,
                    rank: state.isWinner ? 1 : 2,
                    completedAt: finalUserMatch.completedAt ? finalUserMatch.completedAt.toISOString() : null,
                    tournamentDate: (tournament.endDate || tournament.startDate)?.toISOString() || null,
                });
                continue;
            }
            const bronzeUserMatch = bronzeMatches.find((match) => {
                const state = userInMatch(match);
                return state.inP1 || state.inP2;
            });
            if (bronzeUserMatch) {
                const state = userInMatch(bronzeUserMatch);
                if (state.isWinner) {
                    achievements.push({
                        tournamentId: tournament.tournamentId,
                        tournamentName: tournament.tournamentName,
                        rank: 3,
                        completedAt: bronzeUserMatch.completedAt ? bronzeUserMatch.completedAt.toISOString() : null,
                        tournamentDate: (tournament.endDate || tournament.startDate)?.toISOString() || null,
                    });
                    continue;
                }
            }
            const latestUserMatch = [...userMatches].sort((a, b) => b.stageOrder - a.stageOrder)[0];
            if (latestUserMatch && latestUserMatch.stageOrder < maxStageOrder) {
                const state = userInMatch(latestUserMatch);
                if (!state.isWinner) {
                    achievements.push({
                        tournamentId: tournament.tournamentId,
                        tournamentName: tournament.tournamentName,
                        rank: 3,
                        completedAt: latestUserMatch.completedAt ? latestUserMatch.completedAt.toISOString() : null,
                        tournamentDate: (tournament.endDate || tournament.startDate)?.toISOString() || null,
                    });
                }
            }
        }
        return achievements
            .sort((a, b) => a.rank - b.rank || (b.completedAt || '').localeCompare(a.completedAt || ''))
            .slice(0, 12);
    }
    async reportTargetExists(targetType, targetId) {
        switch (targetType) {
            case 'USER': {
                const [target] = await this.db
                    .select({ id: schema.users.id })
                    .from(schema.users)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.id, targetId), (0, drizzle_orm_1.isNull)(schema.users.deletedAt)))
                    .limit(1);
                return Boolean(target);
            }
            case 'TOURNAMENT': {
                const [target] = await this.db
                    .select({ id: schema.tournaments.id })
                    .from(schema.tournaments)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.id, targetId), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
                    .limit(1);
                return Boolean(target);
            }
            case 'MATCH': {
                const [target] = await this.db
                    .select({ id: schema.matches.id })
                    .from(schema.matches)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.id, targetId), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)))
                    .limit(1);
                return Boolean(target);
            }
            case 'COMMUNITY': {
                const [target] = await this.db
                    .select({ id: schema.communities.id })
                    .from(schema.communities)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.communities.id, targetId), (0, drizzle_orm_1.isNull)(schema.communities.deletedAt)))
                    .limit(1);
                return Boolean(target);
            }
        }
    }
    async createReport(reporterId, targetType, targetId, category, reason, evidenceUrls) {
        return this.db.transaction(async (tx) => {
            const [report] = await tx
                .insert(schema.reports)
                .values({
                reporterId,
                targetType,
                targetId,
                category,
                reason,
                evidenceUrls,
                status: 'SUBMITTED',
            })
                .returning();
            await tx.insert(schema.reportActions).values({
                reportId: report.id,
                actorId: reporterId,
                action: 'SUBMIT',
                toStatus: 'SUBMITTED',
            });
            return report;
        });
    }
    async getMyReports(reporterId, query) {
        const conditions = [(0, drizzle_orm_1.eq)(schema.reports.reporterId, reporterId)];
        if (query.status)
            conditions.push((0, drizzle_orm_1.eq)(schema.reports.status, query.status));
        if (query.targetType) {
            conditions.push((0, drizzle_orm_1.eq)(schema.reports.targetType, query.targetType));
        }
        if (query.category) {
            conditions.push((0, drizzle_orm_1.eq)(schema.reports.category, query.category));
        }
        const baseWhereClause = (0, drizzle_orm_1.and)(...conditions);
        const decodedCursor = query.cursor
            ? cursor_pagination_helper_1.CursorPaginationHelper.decodeCursor(query.cursor)
            : null;
        if (decodedCursor) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.lt)(schema.reports.createdAt, new Date(decodedCursor.createdAt)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.reports.createdAt, new Date(decodedCursor.createdAt)), (0, drizzle_orm_1.lt)(schema.reports.id, decodedCursor.id))));
        }
        const whereClause = (0, drizzle_orm_1.and)(...conditions);
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.reports)
            .where(baseWhereClause);
        const reportsQuery = this.db
            .select()
            .from(schema.reports)
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema.reports.createdAt), (0, drizzle_orm_1.desc)(schema.reports.id))
            .limit(query.limit + 1)
            .$dynamic();
        const rawData = await reportsQuery;
        const hasMore = rawData.length > query.limit;
        const data = hasMore ? rawData.slice(0, query.limit) : rawData;
        return {
            data,
            meta: {
                total: totalRecord.count,
                page: query.page,
                limit: query.limit,
                totalPages: Math.ceil(totalRecord.count / query.limit),
                nextCursor: hasMore && data.length > 0
                    ? cursor_pagination_helper_1.CursorPaginationHelper.encodeCursor({ id: data[data.length - 1].id, createdAt: data[data.length - 1].createdAt })
                    : null,
                hasMore,
            },
        };
    }
    async searchUsers(queryStr) {
        const cleanQuery = queryStr.trim();
        return this.db
            .select({
            id: schema.users.id,
            email: schema.users.email,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
            phoneNumber: schema.profiles.phoneNumber,
        })
            .from(schema.users)
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(schema.users.deletedAt), (0, drizzle_orm_1.eq)(schema.users.isMock, false), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema.users.email, `%${cleanQuery}%`), (0, drizzle_orm_1.ilike)(schema.profiles.fullName, `%${cleanQuery}%`), (0, drizzle_orm_1.eq)(schema.profiles.phoneNumber, cleanQuery))))
            .limit(10);
    }
    async createChangeRequest(userId, requestType, oldValue, newValue) {
        return await this.db
            .insert(schema.userChangeRequests)
            .values({
            userId,
            requestType,
            oldValue,
            newValue,
            status: 'PENDING',
        })
            .returning();
    }
    async findChangeRequests(status) {
        const whereClause = status ? (0, drizzle_orm_1.eq)(schema.userChangeRequests.status, status) : undefined;
        return await this.db
            .select({
            id: schema.userChangeRequests.id,
            userId: schema.userChangeRequests.userId,
            requestType: schema.userChangeRequests.requestType,
            oldValue: schema.userChangeRequests.oldValue,
            newValue: schema.userChangeRequests.newValue,
            status: schema.userChangeRequests.status,
            adminNote: schema.userChangeRequests.adminNote,
            createdAt: schema.userChangeRequests.createdAt,
            userEmail: schema.users.email,
            userFullName: schema.profiles.fullName,
        })
            .from(schema.userChangeRequests)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.userChangeRequests.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema.userChangeRequests.createdAt));
    }
    async findChangeRequestById(id) {
        const result = await this.db
            .select()
            .from(schema.userChangeRequests)
            .where((0, drizzle_orm_1.eq)(schema.userChangeRequests.id, id))
            .limit(1);
        return result[0] ?? null;
    }
    async updateChangeRequestStatus(id, status, adminNote) {
        return await this.db
            .update(schema.userChangeRequests)
            .set({ status, adminNote, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.userChangeRequests.id, id))
            .returning();
    }
};
exports.UsersRepository = UsersRepository;
exports.UsersRepository = UsersRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, audit_service_1.AuditService])
], UsersRepository);
//# sourceMappingURL=users.repository.js.map