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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const drizzle_orm_1 = require("drizzle-orm");
const elo_engine_service_1 = require("../rankings/elo-engine.service");
const rankings_service_1 = require("../rankings/rankings.service");
const notifications_service_1 = require("../notifications/notifications.service");
const account_sanction_service_1 = require("../../common/services/account-sanction.service");
const enums_1 = require("../../common/constants/enums");
const notification_builder_1 = require("../notifications/notification-builder");
let AdminService = class AdminService {
    db;
    eloEngine;
    rankingsService;
    notificationsService;
    accountSanctionService;
    constructor(db, eloEngine, rankingsService, notificationsService, accountSanctionService) {
        this.db = db;
        this.eloEngine = eloEngine;
        this.rankingsService = rankingsService;
        this.notificationsService = notificationsService;
        this.accountSanctionService = accountSanctionService;
    }
    extractTournamentPreviousStatus(tournamentConfig, fallbackStatus) {
        if (!tournamentConfig || typeof tournamentConfig !== 'object' || Array.isArray(tournamentConfig)) {
            return fallbackStatus;
        }
        const previousStatus = tournamentConfig.previousStatus;
        return typeof previousStatus === 'string' && previousStatus.length > 0
            ? previousStatus
            : fallbackStatus;
    }
    async logTournamentAdminAction(params) {
        await this.db.insert(schema.auditLogs).values({
            userId: params.adminId,
            action: params.action,
            tableName: 'tournaments',
            recordId: params.tournamentId,
            oldValues: params.oldValues,
            newValues: params.newValues,
        });
    }
    async getMetrics(groupBy = 'month') {
        const intervalStr = groupBy === 'day' ? '1 day' : groupBy === 'week' ? '7 days' : groupBy === 'year' ? '365 days' : '30 days';
        const [paymentsSumTotal] = await this.db
            .select({
            gmv: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.payments.amount}), '0')`,
            netRevenue: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
            transactionsCount: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(schema.payments)
            .where((0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED'));
        const [paymentsSumCurrent] = await this.db
            .select({
            gmv: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.payments.amount}), '0')`,
            netRevenue: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
            transactionsCount: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(schema.payments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED'), (0, drizzle_orm_1.sql) `${schema.payments.paidAt} >= now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)}`));
        const [paymentsSumPrev] = await this.db
            .select({
            gmv: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.payments.amount}), '0')`,
            netRevenue: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
            transactionsCount: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(schema.payments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED'), (0, drizzle_orm_1.sql) `${schema.payments.paidAt} >= now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)} * 2`, (0, drizzle_orm_1.sql) `${schema.payments.paidAt} < now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)}`));
        const [escrowSumTotal] = await this.db
            .select({
            heldEscrow: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.organizerPayouts.amountRequested}), '0')`,
        })
            .from(schema.organizerPayouts)
            .where((0, drizzle_orm_1.eq)(schema.organizerPayouts.status, 'HELD_IN_ESCROW'));
        const [escrowSumCurrent] = await this.db
            .select({
            heldEscrow: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.organizerPayouts.amountRequested}), '0')`,
        })
            .from(schema.organizerPayouts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.organizerPayouts.status, 'HELD_IN_ESCROW'), (0, drizzle_orm_1.sql) `${schema.organizerPayouts.createdAt} >= now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)}`));
        const [escrowSumPrev] = await this.db
            .select({
            heldEscrow: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.organizerPayouts.amountRequested}), '0')`,
        })
            .from(schema.organizerPayouts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.organizerPayouts.status, 'HELD_IN_ESCROW'), (0, drizzle_orm_1.sql) `${schema.organizerPayouts.createdAt} >= now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)} * 2`, (0, drizzle_orm_1.sql) `${schema.organizerPayouts.createdAt} < now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)}`));
        const [usersTotal] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.users)
            .where((0, drizzle_orm_1.eq)(schema.users.isMock, false));
        const [usersCurrent] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.isMock, false), (0, drizzle_orm_1.sql) `${schema.users.createdAt} >= now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)}`));
        const [usersPrev] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.isMock, false), (0, drizzle_orm_1.sql) `${schema.users.createdAt} >= now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)} * 2`, (0, drizzle_orm_1.sql) `${schema.users.createdAt} < now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)}`));
        const [communitiesTotal] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.communities)
            .where((0, drizzle_orm_1.isNull)(schema.communities.deletedAt));
        const [communitiesCurrent] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.communities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(schema.communities.deletedAt), (0, drizzle_orm_1.sql) `${schema.communities.createdAt} >= now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)}`));
        const [communitiesPrev] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.communities)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(schema.communities.deletedAt), (0, drizzle_orm_1.sql) `${schema.communities.createdAt} >= now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)} * 2`, (0, drizzle_orm_1.sql) `${schema.communities.createdAt} < now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)}`));
        const [tournamentsTotal] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt));
        const [tournamentsCurrent] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt), (0, drizzle_orm_1.sql) `${schema.tournaments.createdAt} >= now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)}`));
        const [tournamentsPrev] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt), (0, drizzle_orm_1.sql) `${schema.tournaments.createdAt} >= now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)} * 2`, (0, drizzle_orm_1.sql) `${schema.tournaments.createdAt} < now() - interval ${drizzle_orm_1.sql.raw(`'${intervalStr}'`)}`));
        const calcGrowth = (curr, prev) => {
            if (prev === 0)
                return curr > 0 ? 100 : 0;
            return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
        };
        return {
            gmv: {
                value: parseFloat(paymentsSumTotal.gmv),
                change: calcGrowth(parseFloat(paymentsSumCurrent.gmv), parseFloat(paymentsSumPrev.gmv)),
            },
            netRevenue: {
                value: parseFloat(paymentsSumTotal.netRevenue),
                change: calcGrowth(parseFloat(paymentsSumCurrent.netRevenue), parseFloat(paymentsSumPrev.netRevenue)),
            },
            heldEscrow: {
                value: parseFloat(escrowSumTotal.heldEscrow),
                change: calcGrowth(parseFloat(escrowSumCurrent.heldEscrow), parseFloat(escrowSumPrev.heldEscrow)),
            },
            transactionsCount: {
                value: paymentsSumTotal.transactionsCount,
                change: calcGrowth(paymentsSumCurrent.transactionsCount, paymentsSumPrev.transactionsCount),
            },
            totalUsers: {
                value: usersTotal.count,
                change: usersCurrent.count,
            },
            totalCommunities: {
                value: communitiesTotal.count,
                change: communitiesCurrent.count,
            },
            totalTournaments: {
                value: tournamentsTotal.count,
                change: tournamentsCurrent.count,
            },
        };
    }
    async getRevenueChart(groupBy = 'month', startDate, endDate) {
        const truncateUnit = groupBy === 'day' ? 'day' : groupBy === 'week' ? 'week' : groupBy === 'year' ? 'year' : 'month';
        const conditions = [(0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED')];
        if (startDate) {
            conditions.push((0, drizzle_orm_1.gte)(schema.payments.paidAt, new Date(startDate)));
        }
        if (endDate) {
            conditions.push((0, drizzle_orm_1.lte)(schema.payments.paidAt, new Date(endDate)));
        }
        const whereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const results = await this.db
            .select({
            period: (0, drizzle_orm_1.sql) `date_trunc(${drizzle_orm_1.sql.raw(`'${truncateUnit}'`)}, "payments"."paid_at")`,
            gmv: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.payments.amount}), '0')`,
            revenue: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
            count: (0, drizzle_orm_1.sql) `count(*)::int`,
        })
            .from(schema.payments)
            .where(whereClause)
            .groupBy((0, drizzle_orm_1.sql) `date_trunc(${drizzle_orm_1.sql.raw(`'${truncateUnit}'`)}, "payments"."paid_at")`)
            .orderBy((0, drizzle_orm_1.sql) `date_trunc(${drizzle_orm_1.sql.raw(`'${truncateUnit}'`)}, "payments"."paid_at")`);
        return results.map((row) => ({
            period: row.period,
            gmv: parseFloat(row.gmv),
            revenue: parseFloat(row.revenue),
            count: row.count,
        }));
    }
    async getAuditLogs(page = 1, limit = 10, search, userId, cursor) {
        const conditions = [];
        if (search) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema.auditLogs.tableName, `%${search}%`), (0, drizzle_orm_1.ilike)(schema.auditLogs.action, `%${search}%`)));
        }
        if (userId) {
            conditions.push((0, drizzle_orm_1.eq)(schema.auditLogs.userId, userId));
        }
        const baseWhereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        let whereClause = baseWhereClause;
        let auditCursor = null;
        if (cursor) {
            try {
                auditCursor = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
            }
            catch {
                auditCursor = null;
            }
        }
        if (auditCursor) {
            const cursorDate = new Date(auditCursor.createdAt);
            whereClause = (0, drizzle_orm_1.and)(baseWhereClause, (0, drizzle_orm_1.sql) `(${schema.auditLogs.createdAt} < ${cursorDate} OR (${schema.auditLogs.createdAt} = ${cursorDate} AND ${schema.auditLogs.id} < ${auditCursor.id}))`);
        }
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.auditLogs)
            .where(baseWhereClause);
        let auditQuery = this.db
            .select({
            id: schema.auditLogs.id,
            userId: schema.auditLogs.userId,
            action: schema.auditLogs.action,
            tableName: schema.auditLogs.tableName,
            recordId: schema.auditLogs.recordId,
            oldValues: schema.auditLogs.oldValues,
            newValues: schema.auditLogs.newValues,
            ipAddress: schema.auditLogs.ipAddress,
            userAgent: schema.auditLogs.userAgent,
            createdAt: schema.auditLogs.createdAt,
            user: {
                email: schema.users.email,
                fullName: schema.profiles.fullName,
            },
        })
            .from(schema.auditLogs)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.auditLogs.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema.auditLogs.createdAt), (0, drizzle_orm_1.desc)(schema.auditLogs.id))
            .limit(limit + 1)
            .$dynamic();
        const auditRows = await auditQuery;
        const hasMore = auditRows.length > limit;
        const data = hasMore ? auditRows.slice(0, limit) : auditRows;
        const lastAudit = auditRows.length > 0
            ? auditRows[auditRows.length - 1]
            : undefined;
        return {
            data,
            meta: {
                total: totalRecord.count,
                page,
                limit,
                totalPages: Math.ceil(totalRecord.count / limit),
                nextCursor: hasMore && lastAudit ? Buffer.from(JSON.stringify({ createdAt: lastAudit.createdAt.toISOString(), id: lastAudit.id })).toString('base64url') : null,
                hasMore,
            },
        };
    }
    async submitVerificationTicket(userId, evidenceUrls, contactPhone) {
        const [ticket] = await this.db
            .insert(schema.verificationTickets)
            .values({
            userId,
            evidenceUrls,
            contactPhone,
            status: 'PENDING',
        })
            .returning();
        await this.db.insert(schema.auditLogs).values({
            userId,
            action: 'VERIFICATION_SUBMIT',
            tableName: 'verification_tickets',
            recordId: ticket.id,
            newValues: { userId, contactPhone, evidenceUrls },
        });
        return ticket;
    }
    async listVerificationTickets(status, page = 1, limit = 10, cursor) {
        const conditions = [];
        if (status) {
            conditions.push((0, drizzle_orm_1.eq)(schema.verificationTickets.status, status));
        }
        const baseWhereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        let whereClause = baseWhereClause;
        let ticketCursor = null;
        if (cursor) {
            try {
                ticketCursor = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
            }
            catch {
                ticketCursor = null;
            }
        }
        if (ticketCursor) {
            const cursorDate = new Date(ticketCursor.createdAt);
            whereClause = (0, drizzle_orm_1.and)(baseWhereClause, (0, drizzle_orm_1.sql) `(${schema.verificationTickets.createdAt} < ${cursorDate} OR (${schema.verificationTickets.createdAt} = ${cursorDate} AND ${schema.verificationTickets.id} < ${ticketCursor.id}))`);
        }
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.verificationTickets)
            .where(baseWhereClause);
        let ticketsQuery = this.db
            .select({
            ticket: schema.verificationTickets,
            user: {
                email: schema.users.email,
                fullName: schema.profiles.fullName,
                avatarUrl: schema.profiles.avatarUrl,
            },
        })
            .from(schema.verificationTickets)
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.verificationTickets.userId, schema.users.id))
            .innerJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema.verificationTickets.createdAt), (0, drizzle_orm_1.desc)(schema.verificationTickets.id))
            .limit(limit + 1)
            .$dynamic();
        const ticketRows = await ticketsQuery;
        const hasMore = ticketRows.length > limit;
        const data = hasMore ? ticketRows.slice(0, limit) : ticketRows;
        const lastTicket = ticketRows.length > 0
            ? ticketRows[ticketRows.length - 1]
            : undefined;
        return {
            data,
            meta: {
                total: totalRecord.count,
                page,
                limit,
                totalPages: Math.ceil(totalRecord.count / limit),
                nextCursor: hasMore && lastTicket ? Buffer.from(JSON.stringify({ createdAt: lastTicket.ticket.createdAt.toISOString(), id: lastTicket.ticket.id })).toString('base64url') : null,
                hasMore,
            },
        };
    }
    async approveVerificationTicket(ticketId, adminId) {
        const [ticket] = await this.db
            .select()
            .from(schema.verificationTickets)
            .where((0, drizzle_orm_1.eq)(schema.verificationTickets.id, ticketId))
            .limit(1);
        if (!ticket)
            throw new common_1.NotFoundException('Verification ticket not found');
        if (ticket.status !== 'PENDING')
            throw new common_1.BadRequestException('Ticket is already processed');
        const notification = (0, notification_builder_1.buildVerificationApprovedNotification)({
            receiverId: ticket.userId,
        });
        const updatedTicket = await this.db.transaction(async (tx) => {
            const [updatedTicket] = await tx
                .update(schema.verificationTickets)
                .set({
                status: 'APPROVED',
                reviewedBy: adminId,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema.verificationTickets.id, ticketId))
                .returning();
            await tx
                .update(schema.profiles)
                .set({
                isVerified: true,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema.profiles.userId, ticket.userId));
            const [organizerRole] = await tx
                .select()
                .from(schema.roles)
                .where((0, drizzle_orm_1.eq)(schema.roles.slug, 'organizer'))
                .limit(1);
            if (organizerRole) {
                const [existingUserRole] = await tx
                    .select()
                    .from(schema.userToRoles)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userToRoles.userId, ticket.userId), (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, organizerRole.id)))
                    .limit(1);
                if (!existingUserRole) {
                    await tx.insert(schema.userToRoles).values({
                        userId: ticket.userId,
                        roleId: organizerRole.id,
                        assignedBy: adminId,
                    });
                }
            }
            await tx.insert(schema.auditLogs).values({
                userId: adminId,
                action: 'VERIFICATION_APPROVE',
                tableName: 'verification_tickets',
                recordId: ticketId,
                oldValues: ticket,
                newValues: updatedTicket,
            });
            return updatedTicket;
        });
        await this.notificationsService.sendNotification(notification);
        return updatedTicket;
    }
    async rejectVerificationTicket(ticketId, adminId, rejectReason) {
        const [ticket] = await this.db
            .select()
            .from(schema.verificationTickets)
            .where((0, drizzle_orm_1.eq)(schema.verificationTickets.id, ticketId))
            .limit(1);
        if (!ticket)
            throw new common_1.NotFoundException('Verification ticket not found');
        if (ticket.status !== 'PENDING')
            throw new common_1.BadRequestException('Ticket is already processed');
        const [updatedTicket] = await this.db
            .update(schema.verificationTickets)
            .set({
            status: 'REJECTED',
            rejectReason,
            reviewedBy: adminId,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.verificationTickets.id, ticketId))
            .returning();
        await this.db.insert(schema.auditLogs).values({
            userId: adminId,
            action: 'VERIFICATION_REJECT',
            tableName: 'verification_tickets',
            recordId: ticketId,
            oldValues: ticket,
            newValues: updatedTicket,
        });
        await this.notificationsService.sendNotification((0, notification_builder_1.buildVerificationRejectedNotification)({
            receiverId: ticket.userId,
            reason: rejectReason,
        }));
        return updatedTicket;
    }
    async banUser(userId, adminId, reason, banType, expiresAt) {
        if (userId === adminId) {
            throw new common_1.BadRequestException('Bạn không thể tự phạt hoặc khóa tài khoản của mình.');
        }
        const expiry = expiresAt ? new Date(expiresAt) : null;
        const banRecord = await this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `select pg_advisory_xact_lock(hashtext('system-role-admin-assignment'))`);
            const actorAdminRoles = await tx
                .select({ userId: schema.userToRoles.userId })
                .from(schema.userToRoles)
                .innerJoin(schema.roles, (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, schema.roles.id))
                .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.userToRoles.userId, schema.users.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userToRoles.userId, adminId), (0, drizzle_orm_1.eq)(schema.roles.name, enums_1.UserRole.ADMIN), (0, drizzle_orm_1.isNull)(schema.users.deletedAt)))
                .for('update');
            if (actorAdminRoles.length === 0) {
                throw new common_1.ForbiddenException('Quyền quản trị của bạn không còn hiệu lực. Vui lòng đăng nhập lại.');
            }
            const [target] = await tx
                .select({ id: schema.users.id })
                .from(schema.users)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.id, userId), (0, drizzle_orm_1.isNull)(schema.users.deletedAt)))
                .for('update')
                .limit(1);
            if (!target) {
                throw new common_1.NotFoundException('Không tìm thấy người dùng.');
            }
            const targetAdminRoles = await tx
                .select({ userId: schema.userToRoles.userId })
                .from(schema.userToRoles)
                .innerJoin(schema.roles, (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, schema.roles.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userToRoles.userId, userId), (0, drizzle_orm_1.eq)(schema.roles.name, enums_1.UserRole.ADMIN)))
                .for('update');
            if (banType !== 'WARN' && targetAdminRoles.length > 0) {
                const activeAdmins = await tx
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
                const activeAdminUserIds = new Set(activeAdmins.map((admin) => admin.userId));
                if (activeAdminUserIds.has(userId) && activeAdminUserIds.size <= 1) {
                    throw new common_1.BadRequestException('Không thể phạt hoặc khóa quản trị viên hệ thống cuối cùng.');
                }
            }
            const [createdBan] = await tx
                .insert(schema.userBans)
                .values({
                userId,
                bannedBy: adminId,
                reason,
                banType,
                expiresAt: expiry,
                isActive: true,
            })
                .returning();
            if (banType === 'HARD_BAN') {
                await tx
                    .update(schema.communities)
                    .set({ status: 'SUSPENDED', updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(schema.communities.creatorId, userId));
            }
            if (banType === 'SOFT_BAN' || banType === 'HARD_BAN') {
                await tx
                    .update(schema.sessions)
                    .set({ isRevoked: true, revokedAt: new Date() })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.sessions.userId, userId), (0, drizzle_orm_1.eq)(schema.sessions.isRevoked, false)));
            }
            await tx.insert(schema.auditLogs).values({
                userId: adminId,
                action: `USER_BAN_${banType}`,
                tableName: 'user_bans',
                recordId: createdBan.id,
                newValues: createdBan,
            });
            return createdBan;
        });
        if (banType === 'SOFT_BAN' || banType === 'HARD_BAN') {
            await this.accountSanctionService.markAccessBanned(userId, expiry);
        }
        await this.notificationsService.sendNotification((0, notification_builder_1.buildUserBannedNotification)({
            receiverId: userId,
            reason,
            banType,
        }));
        return banRecord;
    }
    async unbanUser(userId, adminId) {
        if (userId === adminId) {
            throw new common_1.BadRequestException('Bạn không thể tự gỡ xử lý tài khoản của mình.');
        }
        const bans = await this.db
            .update(schema.userBans)
            .set({ isActive: false })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userBans.userId, userId), (0, drizzle_orm_1.eq)(schema.userBans.isActive, true)))
            .returning();
        await this.accountSanctionService.invalidateAccessBan(userId);
        await this.db
            .update(schema.communities)
            .set({
            status: 'ACTIVE',
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.communities.creatorId, userId));
        for (const ban of bans) {
            await this.db.insert(schema.auditLogs).values({
                userId: adminId,
                action: 'USER_UNBAN',
                tableName: 'user_bans',
                recordId: ban.id,
                newValues: { userId, isActive: false },
            });
        }
        if (bans.length > 0) {
            await this.notificationsService.sendNotification((0, notification_builder_1.buildUserUnbannedNotification)({
                receiverId: userId,
            }));
        }
        return { success: true, bansUnbanned: bans.length };
    }
    async getConfigs() {
        await this.getOrInitConfig('ALLOW_TOURNAMENT_ENTRY_FEES', 'true', 'Cho phép ban tổ chức đặt lệ phí đăng ký cho giải đấu mới hoặc khi chỉnh sửa giải.');
        return this.db.select().from(schema.systemConfigs);
    }
    async updateConfig(key, value, description, adminId) {
        if (key === 'ALLOW_TOURNAMENT_ENTRY_FEES' &&
            !['true', 'false'].includes(value.trim().toLowerCase())) {
            throw new common_1.BadRequestException('ALLOW_TOURNAMENT_ENTRY_FEES chỉ nhận giá trị true hoặc false');
        }
        const normalizedValue = key === 'ALLOW_TOURNAMENT_ENTRY_FEES'
            ? value.trim().toLowerCase()
            : value;
        const [existing] = await this.db
            .select()
            .from(schema.systemConfigs)
            .where((0, drizzle_orm_1.eq)(schema.systemConfigs.key, key))
            .limit(1);
        let configRecord;
        if (existing) {
            [configRecord] = await this.db
                .update(schema.systemConfigs)
                .set({
                value: normalizedValue,
                description: description || existing.description,
                updatedBy: adminId,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema.systemConfigs.key, key))
                .returning();
        }
        else {
            [configRecord] = await this.db
                .insert(schema.systemConfigs)
                .values({
                key,
                value: normalizedValue,
                description,
                updatedBy: adminId,
            })
                .returning();
        }
        await this.db.insert(schema.auditLogs).values({
            userId: adminId,
            action: 'SYSTEM_CONFIG_UPDATE',
            tableName: 'system_configs',
            recordId: (0, drizzle_orm_1.sql) `gen_random_uuid()`,
            oldValues: existing || null,
            newValues: configRecord,
        });
        return configRecord;
    }
    async getOrInitConfig(key, defaultValue, description) {
        const [existing] = await this.db
            .select()
            .from(schema.systemConfigs)
            .where((0, drizzle_orm_1.eq)(schema.systemConfigs.key, key))
            .limit(1);
        if (existing) {
            return existing.value;
        }
        const [anyUser] = await this.db.select({ id: schema.users.id }).from(schema.users).limit(1);
        if (!anyUser)
            return defaultValue;
        try {
            await this.db.insert(schema.systemConfigs).values({
                key,
                value: defaultValue,
                description: description || '',
                updatedBy: anyUser.id,
            });
        }
        catch (err) {
            console.error(`Failed to seed config key ${key} dynamically:`, err);
        }
        return defaultValue;
    }
    async getFeesConfig() {
        return {
            feePublicRanked: parseFloat(await this.getOrInitConfig('TOURNAMENT_PUBLISH_FEE_PUBLIC_RANKED', '0')),
            feePublicUnranked: parseFloat(await this.getOrInitConfig('TOURNAMENT_PUBLISH_FEE_PUBLIC_UNRANKED', '0')),
            feeClub: parseFloat(await this.getOrInitConfig('TOURNAMENT_PUBLISH_FEE_CLUB', '0')),
            pctPublicRanked: parseFloat(await this.getOrInitConfig('PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED', '5')),
            pctPublicUnranked: parseFloat(await this.getOrInitConfig('PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED', '5')),
            pctClub: parseFloat(await this.getOrInitConfig('PLATFORM_FEE_PERCENTAGE_CLUB', '0')),
            allowEntryFees: (await this.getOrInitConfig('ALLOW_TOURNAMENT_ENTRY_FEES', 'true', 'Cho phép ban tổ chức đặt lệ phí đăng ký cho giải đấu mới hoặc khi chỉnh sửa giải.')).toLowerCase() === 'true',
        };
    }
    async listReports(query) {
        const reporterUser = (0, drizzle_orm_1.aliasedTable)(schema.users, 'reporter_user');
        const reporterProfile = (0, drizzle_orm_1.aliasedTable)(schema.profiles, 'reporter_profile');
        const targetUser = (0, drizzle_orm_1.aliasedTable)(schema.users, 'target_user');
        const targetUserProfile = (0, drizzle_orm_1.aliasedTable)(schema.profiles, 'target_user_profile');
        const targetTournament = (0, drizzle_orm_1.aliasedTable)(schema.tournaments, 'target_tournament');
        const targetMatch = (0, drizzle_orm_1.aliasedTable)(schema.matches, 'target_match');
        const targetCommunity = (0, drizzle_orm_1.aliasedTable)(schema.communities, 'target_community');
        const assignedUser = (0, drizzle_orm_1.aliasedTable)(schema.users, 'assigned_user');
        const assignedProfile = (0, drizzle_orm_1.aliasedTable)(schema.profiles, 'assigned_profile');
        const conditions = [];
        if (query.status)
            conditions.push((0, drizzle_orm_1.eq)(schema.reports.status, query.status));
        if (query.targetType) {
            conditions.push((0, drizzle_orm_1.eq)(schema.reports.targetType, query.targetType));
        }
        if (query.category) {
            conditions.push((0, drizzle_orm_1.eq)(schema.reports.category, query.category));
        }
        if (query.from) {
            conditions.push((0, drizzle_orm_1.gte)(schema.reports.createdAt, new Date(query.from)));
        }
        if (query.to) {
            conditions.push((0, drizzle_orm_1.lte)(schema.reports.createdAt, new Date(query.to)));
        }
        if (query.search?.trim()) {
            const keyword = `%${query.search.trim()}%`;
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema.reports.reason, keyword), (0, drizzle_orm_1.ilike)(reporterUser.email, keyword), (0, drizzle_orm_1.ilike)(reporterProfile.fullName, keyword), (0, drizzle_orm_1.ilike)(targetUser.email, keyword), (0, drizzle_orm_1.ilike)(targetUserProfile.fullName, keyword), (0, drizzle_orm_1.ilike)(targetTournament.name, keyword), (0, drizzle_orm_1.ilike)(targetCommunity.name, keyword)));
        }
        const baseWhereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        let whereClause = baseWhereClause;
        let reportCursor = null;
        if (query.cursor) {
            try {
                reportCursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8'));
            }
            catch {
                reportCursor = null;
            }
        }
        if (reportCursor) {
            const cursorDate = new Date(reportCursor.createdAt);
            whereClause = (0, drizzle_orm_1.and)(baseWhereClause, (0, drizzle_orm_1.sql) `(${schema.reports.createdAt} < ${cursorDate} OR (${schema.reports.createdAt} = ${cursorDate} AND ${schema.reports.id} < ${reportCursor.id}))`);
        }
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.reports)
            .innerJoin(reporterUser, (0, drizzle_orm_1.eq)(schema.reports.reporterId, reporterUser.id))
            .leftJoin(reporterProfile, (0, drizzle_orm_1.eq)(reporterUser.id, reporterProfile.userId))
            .leftJoin(targetUser, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.reports.targetType, 'USER'), (0, drizzle_orm_1.eq)(schema.reports.targetId, targetUser.id)))
            .leftJoin(targetUserProfile, (0, drizzle_orm_1.eq)(targetUser.id, targetUserProfile.userId))
            .leftJoin(targetTournament, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.reports.targetType, 'TOURNAMENT'), (0, drizzle_orm_1.eq)(schema.reports.targetId, targetTournament.id)))
            .leftJoin(targetMatch, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.reports.targetType, 'MATCH'), (0, drizzle_orm_1.eq)(schema.reports.targetId, targetMatch.id)))
            .leftJoin(targetCommunity, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.reports.targetType, 'COMMUNITY'), (0, drizzle_orm_1.eq)(schema.reports.targetId, targetCommunity.id)))
            .where(baseWhereClause);
        let reportsQuery = this.db
            .select({
            id: schema.reports.id,
            targetType: schema.reports.targetType,
            targetId: schema.reports.targetId,
            source: schema.reports.source,
            sourceReferenceId: schema.reports.sourceReferenceId,
            category: schema.reports.category,
            reason: schema.reports.reason,
            evidenceUrls: schema.reports.evidenceUrls,
            status: schema.reports.status,
            assignedTo: schema.reports.assignedTo,
            resolutionNote: schema.reports.resolutionNote,
            triagedAt: schema.reports.triagedAt,
            createdAt: schema.reports.createdAt,
            updatedAt: schema.reports.updatedAt,
            resolvedAt: schema.reports.resolvedAt,
            reporter: {
                id: reporterUser.id,
                email: reporterUser.email,
                fullName: reporterProfile.fullName,
            },
            targetUser: {
                id: targetUser.id,
                email: targetUser.email,
                fullName: targetUserProfile.fullName,
            },
            targetTournament: {
                id: targetTournament.id,
                name: targetTournament.name,
                status: targetTournament.status,
            },
            targetMatch: {
                id: targetMatch.id,
                tournamentId: targetMatch.tournamentId,
                status: targetMatch.status,
                roundNumber: targetMatch.roundNumber,
                matchOrder: targetMatch.matchOrder,
            },
            targetCommunity: {
                id: targetCommunity.id,
                name: targetCommunity.name,
                status: targetCommunity.status,
            },
            assignee: {
                id: assignedUser.id,
                email: assignedUser.email,
                fullName: assignedProfile.fullName,
            },
        })
            .from(schema.reports)
            .innerJoin(reporterUser, (0, drizzle_orm_1.eq)(schema.reports.reporterId, reporterUser.id))
            .leftJoin(reporterProfile, (0, drizzle_orm_1.eq)(reporterUser.id, reporterProfile.userId))
            .leftJoin(targetUser, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.reports.targetType, 'USER'), (0, drizzle_orm_1.eq)(schema.reports.targetId, targetUser.id)))
            .leftJoin(targetUserProfile, (0, drizzle_orm_1.eq)(targetUser.id, targetUserProfile.userId))
            .leftJoin(targetTournament, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.reports.targetType, 'TOURNAMENT'), (0, drizzle_orm_1.eq)(schema.reports.targetId, targetTournament.id)))
            .leftJoin(targetMatch, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.reports.targetType, 'MATCH'), (0, drizzle_orm_1.eq)(schema.reports.targetId, targetMatch.id)))
            .leftJoin(targetCommunity, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.reports.targetType, 'COMMUNITY'), (0, drizzle_orm_1.eq)(schema.reports.targetId, targetCommunity.id)))
            .leftJoin(assignedUser, (0, drizzle_orm_1.eq)(schema.reports.assignedTo, assignedUser.id))
            .leftJoin(assignedProfile, (0, drizzle_orm_1.eq)(assignedUser.id, assignedProfile.userId))
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema.reports.createdAt), (0, drizzle_orm_1.desc)(schema.reports.id))
            .limit(query.limit + 1)
            .$dynamic();
        const reportRows = await reportsQuery;
        const hasMore = reportRows.length > query.limit;
        const data = hasMore ? reportRows.slice(0, query.limit) : reportRows;
        const lastReport = reportRows.length > 0
            ? reportRows[reportRows.length - 1]
            : undefined;
        const total = Number(totalRecord?.count ?? 0);
        return {
            data,
            meta: {
                total,
                page: query.page,
                limit: query.limit,
                totalPages: Math.ceil(total / query.limit),
                nextCursor: hasMore && lastReport ? Buffer.from(JSON.stringify({ createdAt: lastReport.createdAt.toISOString(), id: lastReport.id })).toString('base64url') : null,
                hasMore,
            },
        };
    }
    async getReportActions(reportId) {
        const [report] = await this.db
            .select({ id: schema.reports.id })
            .from(schema.reports)
            .where((0, drizzle_orm_1.eq)(schema.reports.id, reportId))
            .limit(1);
        if (!report) {
            throw new common_1.NotFoundException('Không tìm thấy báo cáo vi phạm');
        }
        const actorUser = (0, drizzle_orm_1.aliasedTable)(schema.users, 'report_action_actor');
        const actorProfile = (0, drizzle_orm_1.aliasedTable)(schema.profiles, 'report_action_profile');
        return this.db
            .select({
            id: schema.reportActions.id,
            action: schema.reportActions.action,
            fromStatus: schema.reportActions.fromStatus,
            toStatus: schema.reportActions.toStatus,
            note: schema.reportActions.note,
            metadata: schema.reportActions.metadata,
            createdAt: schema.reportActions.createdAt,
            actor: {
                id: actorUser.id,
                email: actorUser.email,
                fullName: actorProfile.fullName,
            },
        })
            .from(schema.reportActions)
            .leftJoin(actorUser, (0, drizzle_orm_1.eq)(schema.reportActions.actorId, actorUser.id))
            .leftJoin(actorProfile, (0, drizzle_orm_1.eq)(actorUser.id, actorProfile.userId))
            .where((0, drizzle_orm_1.eq)(schema.reportActions.reportId, reportId))
            .orderBy((0, drizzle_orm_1.asc)(schema.reportActions.createdAt));
    }
    async transitionReport(params) {
        const updatedReport = await this.db.transaction(async (tx) => {
            const [current] = await tx
                .select()
                .from(schema.reports)
                .where((0, drizzle_orm_1.eq)(schema.reports.id, params.reportId))
                .limit(1);
            if (!current) {
                throw new common_1.NotFoundException('Không tìm thấy báo cáo vi phạm');
            }
            if (!params.expectedStatuses.includes(current.status)) {
                throw new common_1.BadRequestException(`Không thể chuyển báo cáo từ trạng thái ${current.status} sang ${params.targetStatus}`);
            }
            const isFinal = ['RESOLVED', 'REJECTED'].includes(params.targetStatus);
            const [updated] = await tx
                .update(schema.reports)
                .set({
                status: params.targetStatus,
                category: params.category ?? current.category,
                assignedTo: params.actorId,
                triagedAt: params.targetStatus === 'TRIAGED'
                    ? new Date()
                    : current.triagedAt,
                resolvedBy: isFinal ? params.actorId : current.resolvedBy,
                resolutionNote: isFinal ? params.note : current.resolutionNote,
                resolvedAt: isFinal ? new Date() : current.resolvedAt,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.reports.id, params.reportId), (0, drizzle_orm_1.eq)(schema.reports.status, current.status)))
                .returning();
            if (!updated) {
                throw new common_1.ConflictException('Báo cáo vừa được người khác cập nhật, vui lòng tải lại dữ liệu');
            }
            await tx.insert(schema.reportActions).values({
                reportId: params.reportId,
                actorId: params.actorId,
                action: params.action,
                fromStatus: current.status,
                toStatus: params.targetStatus,
                note: params.note,
            });
            await tx.insert(schema.auditLogs).values({
                userId: params.actorId,
                action: `REPORT_${params.action}`,
                tableName: 'reports',
                recordId: params.reportId,
                oldValues: { status: current.status, assignedTo: current.assignedTo },
                newValues: {
                    status: params.targetStatus,
                    assignedTo: params.actorId,
                    note: params.note,
                },
            });
            return updated;
        });
        await this.sendReportStatusNotification(updatedReport);
        return updatedReport;
    }
    async sendReportStatusNotification(report) {
        const contentByStatus = {
            TRIAGED: 'Báo cáo của bạn đã được phân loại và có người tiếp nhận.',
            UNDER_REVIEW: 'Báo cáo của bạn đang được xác minh.',
            ESCALATED: 'Báo cáo của bạn đã được chuyển lên quản trị viên để xem xét.',
            RESOLVED: 'Báo cáo của bạn đã được xử lý và kết luận.',
            REJECTED: 'Báo cáo của bạn đã được xem xét và không được chấp nhận.',
        };
        try {
            await this.notificationsService.sendNotification({
                receiverId: report.reporterId,
                type: `REPORT_${report.status}`,
                title: 'Cập nhật báo cáo vi phạm',
                content: contentByStatus[report.status] ?? 'Báo cáo của bạn vừa được cập nhật.',
                redirectUrl: `/profile/reports?reportId=${report.id}`,
            });
        }
        catch (error) {
            console.error('Không thể gửi thông báo trạng thái báo cáo:', error);
        }
    }
    async triageReport(reportId, moderatorId, note, category) {
        return this.transitionReport({
            reportId,
            actorId: moderatorId,
            action: 'TRIAGE',
            expectedStatuses: ['SUBMITTED'],
            targetStatus: 'TRIAGED',
            note,
            category,
        });
    }
    async startReportReview(reportId, moderatorId, note) {
        return this.transitionReport({
            reportId,
            actorId: moderatorId,
            action: 'START_REVIEW',
            expectedStatuses: ['SUBMITTED', 'TRIAGED'],
            targetStatus: 'UNDER_REVIEW',
            note,
        });
    }
    async escalateReport(reportId, moderatorId, note) {
        return this.transitionReport({
            reportId,
            actorId: moderatorId,
            action: 'ESCALATE',
            expectedStatuses: ['SUBMITTED', 'TRIAGED', 'UNDER_REVIEW'],
            targetStatus: 'ESCALATED',
            note,
        });
    }
    async resolveReport(reportId, actorId, status, resolutionNote, isAdmin, category) {
        const expectedStatuses = isAdmin
            ? ['SUBMITTED', 'TRIAGED', 'UNDER_REVIEW', 'ESCALATED']
            : ['SUBMITTED', 'TRIAGED', 'UNDER_REVIEW'];
        if (status === 'RESOLVED' && !isAdmin) {
            const [report] = await this.db
                .select({ status: schema.reports.status })
                .from(schema.reports)
                .where((0, drizzle_orm_1.eq)(schema.reports.id, reportId))
                .limit(1);
            if (report?.status === 'ESCALATED') {
                throw new common_1.BadRequestException('Báo cáo đã chuyển cấp chỉ quản trị viên mới được kết luận');
            }
        }
        return this.transitionReport({
            reportId,
            actorId,
            action: status === 'RESOLVED' ? 'RESOLVE' : 'REJECT',
            expectedStatuses,
            targetStatus: status,
            note: resolutionNote,
            category,
        });
    }
    async suspendTournament(tournamentId, adminId, note) {
        const [tournament] = await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .limit(1);
        if (!tournament) {
            throw new common_1.NotFoundException('Tournament not found');
        }
        if (tournament.status === 'SUSPENDED' || tournament.status === 'CANCELLED') {
            throw new common_1.BadRequestException('Tournament is already suspended or cancelled');
        }
        const currentConfig = tournament.tournamentConfig && typeof tournament.tournamentConfig === 'object' && !Array.isArray(tournament.tournamentConfig)
            ? tournament.tournamentConfig
            : {};
        const updatedConfig = {
            ...currentConfig,
            previousStatus: tournament.status,
        };
        const [updatedTournament] = await this.db
            .update(schema.tournaments)
            .set({
            status: 'SUSPENDED',
            tournamentConfig: updatedConfig,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .returning();
        await this.notificationsService.sendNotification((0, notification_builder_1.buildTournamentSuspendedNotification)({
            receiverId: tournament.createdBy,
            tournamentId,
            tournamentName: tournament.name,
            reason: note,
        }));
        await this.logTournamentAdminAction({
            adminId,
            action: 'TOURNAMENT_SUSPEND',
            tournamentId,
            oldValues: {
                status: tournament.status,
                tournamentConfig: tournament.tournamentConfig,
            },
            newValues: {
                status: updatedTournament.status,
                tournamentConfig: updatedTournament.tournamentConfig,
                note: note || null,
            },
        });
        return updatedTournament;
    }
    async unsuspendTournament(tournamentId, adminId) {
        const [tournament] = await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .limit(1);
        if (!tournament) {
            throw new common_1.NotFoundException('Tournament not found');
        }
        if (tournament.status !== 'SUSPENDED') {
            throw new common_1.BadRequestException('Tournament is not suspended');
        }
        const restoreStatus = this.extractTournamentPreviousStatus(tournament.tournamentConfig, 'UPCOMING');
        const [updatedTournament] = await this.db
            .update(schema.tournaments)
            .set({
            status: restoreStatus,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .returning();
        await this.notificationsService.sendNotification((0, notification_builder_1.buildTournamentUnsuspendedNotification)({
            receiverId: tournament.createdBy,
            tournamentId,
            tournamentName: tournament.name,
        }));
        await this.logTournamentAdminAction({
            adminId,
            action: 'TOURNAMENT_UNSUSPEND',
            tournamentId,
            oldValues: {
                status: tournament.status,
                tournamentConfig: tournament.tournamentConfig,
            },
            newValues: {
                status: updatedTournament.status,
                tournamentConfig: updatedTournament.tournamentConfig,
            },
        });
        return updatedTournament;
    }
    async approveTournament(tournamentId, adminId) {
        const [tournament] = await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .limit(1);
        if (!tournament) {
            throw new common_1.NotFoundException('Tournament not found');
        }
        if (tournament.status !== 'PENDING_APPROVAL') {
            throw new common_1.BadRequestException('Tournament is not pending approval');
        }
        const registrationStartsAt = tournament.registrationStartDate
            ? new Date(tournament.registrationStartDate)
            : null;
        const nextStatus = registrationStartsAt && registrationStartsAt > new Date()
            ? 'UPCOMING'
            : 'REGISTRATION_OPEN';
        const [updatedTournament] = await this.db
            .update(schema.tournaments)
            .set({
            status: nextStatus,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .returning();
        await this.notificationsService.sendNotification((0, notification_builder_1.buildTournamentPublishApprovedNotification)({
            receiverId: tournament.createdBy,
            tournamentId,
            tournamentName: tournament.name,
        }));
        await this.logTournamentAdminAction({
            adminId,
            action: 'TOURNAMENT_APPROVE',
            tournamentId,
            oldValues: { status: tournament.status },
            newValues: { status: updatedTournament.status },
        });
        return updatedTournament;
    }
    async rejectTournament(tournamentId, adminId, note) {
        const [tournament] = await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .limit(1);
        if (!tournament) {
            throw new common_1.NotFoundException('Tournament not found');
        }
        if (tournament.status !== 'PENDING_APPROVAL') {
            throw new common_1.BadRequestException('Tournament is not pending approval');
        }
        const [updatedTournament] = await this.db
            .update(schema.tournaments)
            .set({
            status: 'CANCELLED',
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .returning();
        await this.notificationsService.sendNotification((0, notification_builder_1.buildTournamentPublishRejectedNotification)({
            receiverId: tournament.createdBy,
            tournamentId,
            tournamentName: tournament.name,
            reason: note,
        }));
        await this.logTournamentAdminAction({
            adminId,
            action: 'TOURNAMENT_REJECT',
            tournamentId,
            oldValues: { status: tournament.status },
            newValues: {
                status: updatedTournament.status,
                note: note || null,
            },
        });
        return updatedTournament;
    }
    async banTournament(tournamentId, adminId, note) {
        const [tournament] = await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .limit(1);
        if (!tournament) {
            throw new common_1.NotFoundException('Tournament not found');
        }
        const currentConfig = tournament.tournamentConfig && typeof tournament.tournamentConfig === 'object' && !Array.isArray(tournament.tournamentConfig)
            ? tournament.tournamentConfig
            : {};
        const updatedConfig = {
            ...currentConfig,
            previousStatus: tournament.status,
        };
        const [updatedTournament] = await this.db
            .update(schema.tournaments)
            .set({
            status: 'CANCELLED',
            tournamentConfig: updatedConfig,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .returning();
        await this.notificationsService.sendNotification((0, notification_builder_1.buildTournamentCancelledNotification)({
            receiverId: tournament.createdBy,
            tournamentId,
            tournamentName: tournament.name,
        }));
        await this.logTournamentAdminAction({
            adminId,
            action: 'TOURNAMENT_BAN',
            tournamentId,
            oldValues: {
                status: tournament.status,
                tournamentConfig: tournament.tournamentConfig,
            },
            newValues: {
                status: updatedTournament.status,
                tournamentConfig: updatedTournament.tournamentConfig,
                note: note || null,
            },
        });
        return updatedTournament;
    }
    async approveDeleteTournament(tournamentId, adminId) {
        const [tournament] = await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .limit(1);
        if (!tournament) {
            throw new common_1.NotFoundException('Tournament not found');
        }
        if (tournament.status !== 'PENDING_DELETE') {
            throw new common_1.BadRequestException('Tournament deletion is not pending approval');
        }
        const [paidCount] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.payments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED')));
        const paidPayments = paidCount?.count || 0;
        const [nonRefundedCount] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.payments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED'), (0, drizzle_orm_1.sql) `${schema.payments.refundStatus} IS DISTINCT FROM 'REFUNDED'`));
        const nonRefundedPayments = nonRefundedCount?.count || 0;
        const fullyRefunded = nonRefundedPayments === 0;
        if (paidPayments > 0 && !fullyRefunded) {
            throw new common_1.BadRequestException('Không thể xóa giải đấu vì chưa hoàn tiền đầy đủ cho tất cả vận động viên.');
        }
        const [pendingRefundCount] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.paymentRefunds)
            .innerJoin(schema.payments, (0, drizzle_orm_1.eq)(schema.paymentRefunds.paymentId, schema.payments.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.paymentRefunds.status, 'REQUESTED')));
        const pendingRefunds = pendingRefundCount?.count || 0;
        if (pendingRefunds > 0) {
            throw new common_1.BadRequestException('Không thể xóa giải đấu vì còn giao dịch đang chờ hoàn tiền.');
        }
        const deletedTournament = await this.db.transaction(async (tx) => {
            const [deleted] = await tx
                .update(schema.tournaments)
                .set({ deletedAt: new Date(), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
                .returning();
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
                        .set({ deletedAt: new Date(), updatedAt: new Date() })
                        .where((0, drizzle_orm_1.inArray)(schema.matches.groupId, groupIds));
                }
            }
            await tx
                .delete(schema.notifications)
                .where((0, drizzle_orm_1.like)(schema.notifications.redirectUrl, `%/${tournamentId}%`));
            if (tournament.parentId) {
                const siblings = await tx
                    .select()
                    .from(schema.tournaments)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.parentId, tournament.parentId), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)));
                if (siblings.length === 0) {
                    await tx
                        .update(schema.parentTournaments)
                        .set({ deletedAt: new Date(), updatedAt: new Date() })
                        .where((0, drizzle_orm_1.eq)(schema.parentTournaments.id, tournament.parentId));
                    await tx
                        .delete(schema.notifications)
                        .where((0, drizzle_orm_1.like)(schema.notifications.redirectUrl, `%/${tournament.parentId}%`));
                }
            }
            return deleted;
        });
        await this.notificationsService.sendNotification((0, notification_builder_1.buildTournamentDeleteApprovedNotification)({
            receiverId: tournament.createdBy,
            tournamentName: tournament.name,
        }));
        await this.logTournamentAdminAction({
            adminId,
            action: 'TOURNAMENT_DELETE_APPROVE',
            tournamentId,
            oldValues: {
                status: tournament.status,
                deletedAt: null,
            },
            newValues: {
                status: deletedTournament.status,
                deletedAt: deletedTournament.deletedAt,
            },
        });
        return deletedTournament;
    }
    async rejectDeleteTournament(tournamentId, adminId, note) {
        const [tournament] = await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .limit(1);
        if (!tournament) {
            throw new common_1.NotFoundException('Tournament not found');
        }
        if (tournament.status !== 'PENDING_DELETE') {
            throw new common_1.BadRequestException('Tournament deletion is not pending approval');
        }
        const restoredStatus = this.extractTournamentPreviousStatus(tournament.tournamentConfig, 'REGISTRATION_OPEN');
        const [updatedTournament] = await this.db
            .update(schema.tournaments)
            .set({
            status: restoredStatus,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId))
            .returning();
        await this.notificationsService.sendNotification((0, notification_builder_1.buildTournamentDeleteRejectedNotification)({
            receiverId: tournament.createdBy,
            tournamentId,
            tournamentName: tournament.name,
            reason: note,
        }));
        if (tournament.parentId) {
            const siblingTournaments = await this.db
                .select({
                id: schema.tournaments.id,
                tournamentConfig: schema.tournaments.tournamentConfig,
            })
                .from(schema.tournaments)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.parentId, tournament.parentId), (0, drizzle_orm_1.eq)(schema.tournaments.status, 'PENDING_DELETE'), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)));
            for (const sibling of siblingTournaments) {
                const siblingRestoreStatus = this.extractTournamentPreviousStatus(sibling.tournamentConfig, restoredStatus);
                await this.db
                    .update(schema.tournaments)
                    .set({
                    status: siblingRestoreStatus,
                    updatedAt: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(schema.tournaments.id, sibling.id));
            }
        }
        await this.logTournamentAdminAction({
            adminId,
            action: 'TOURNAMENT_DELETE_REJECT',
            tournamentId,
            oldValues: {
                status: tournament.status,
                tournamentConfig: tournament.tournamentConfig,
            },
            newValues: {
                status: updatedTournament.status,
                note: note || null,
            },
        });
        return updatedTournament;
    }
    async listTournaments(page = 1, limit = 10, search, status, cursor) {
        const conditions = [(0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)];
        if (search) {
            conditions.push((0, drizzle_orm_1.ilike)(schema.tournaments.name, `%${search}%`));
        }
        if (status) {
            if (status === 'ONGOING') {
                conditions.push((0, drizzle_orm_1.inArray)(schema.tournaments.status, [
                    'UPCOMING',
                    'REGISTRATION_OPEN',
                    'REGISTRATION_CLOSED',
                    'IN_PROGRESS',
                ]));
            }
            else {
                conditions.push((0, drizzle_orm_1.eq)(schema.tournaments.status, status));
            }
        }
        const baseWhereClause = (0, drizzle_orm_1.and)(...conditions);
        let whereClause = baseWhereClause;
        let tournamentCursor = null;
        if (cursor) {
            try {
                tournamentCursor = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
            }
            catch {
                tournamentCursor = null;
            }
        }
        if (tournamentCursor) {
            const cursorDate = new Date(tournamentCursor.createdAt);
            whereClause = (0, drizzle_orm_1.and)(baseWhereClause, (0, drizzle_orm_1.sql) `(${schema.tournaments.createdAt} < ${cursorDate} OR (${schema.tournaments.createdAt} = ${cursorDate} AND ${schema.tournaments.id} < ${tournamentCursor.id}))`);
        }
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.tournaments)
            .where(baseWhereClause);
        let tournamentsQuery = this.db
            .select({
            id: schema.tournaments.id,
            name: schema.tournaments.name,
            status: schema.tournaments.status,
            entryFee: schema.tournaments.entryFee,
            matchType: schema.tournaments.matchType,
            tournamentType: schema.tournaments.tournamentType,
            visibility: schema.tournaments.visibility,
            createdAt: schema.tournaments.createdAt,
            creator: {
                id: schema.users.id,
                email: schema.users.email,
                fullName: schema.profiles.fullName,
            }
        })
            .from(schema.tournaments)
            .leftJoin(schema.users, (0, drizzle_orm_1.eq)(schema.tournaments.createdBy, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema.tournaments.createdAt), (0, drizzle_orm_1.desc)(schema.tournaments.id))
            .limit(limit + 1)
            .$dynamic();
        const tournamentRows = await tournamentsQuery;
        const hasMore = tournamentRows.length > limit;
        const data = hasMore ? tournamentRows.slice(0, limit) : tournamentRows;
        const lastTournament = tournamentRows.length > 0
            ? tournamentRows[tournamentRows.length - 1]
            : undefined;
        return {
            data,
            meta: {
                total: totalRecord.count,
                page,
                limit,
                totalPages: Math.ceil(totalRecord.count / limit),
                nextCursor: hasMore && lastTournament ? Buffer.from(JSON.stringify({ createdAt: lastTournament.createdAt.toISOString(), id: lastTournament.id })).toString('base64url') : null,
                hasMore,
            },
        };
    }
    async getUserVerificationTickets(userId) {
        return this.db
            .select()
            .from(schema.verificationTickets)
            .where((0, drizzle_orm_1.eq)(schema.verificationTickets.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema.verificationTickets.createdAt));
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, elo_engine_service_1.EloEngineService,
        rankings_service_1.RankingsService,
        notifications_service_1.NotificationsService,
        account_sanction_service_1.AccountSanctionService])
], AdminService);
//# sourceMappingURL=admin.service.js.map