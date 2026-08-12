import { Injectable, Inject, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, desc, sql, or, ilike, count, SQL, asc, gte, lte, inArray, isNull, aliasedTable, like } from 'drizzle-orm';
import { EloEngineService } from '../rankings/elo-engine.service';
import { RankingsService } from '../rankings/rankings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueryReportsDto } from './dto/admin.dto';
import type { ReportStatus } from '../users/dto/query-my-reports.dto';
import type { ReportCategory } from '../users/dto/create-report.dto';
import {
  buildTournamentDeleteApprovedNotification,
  buildTournamentDeleteRejectedNotification,
  buildTournamentCancelledNotification,
  buildTournamentPublishApprovedNotification,
  buildTournamentPublishRejectedNotification,
  buildTournamentSuspendedNotification,
  buildTournamentUnsuspendedNotification,
  buildVerificationApprovedNotification,
  buildVerificationRejectedNotification,
  buildUserBannedNotification,
  buildUserUnbannedNotification,
} from '../notifications/notification-builder';

@Injectable()
export class AdminService {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly eloEngine: EloEngineService,
    private readonly rankingsService: RankingsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private extractTournamentPreviousStatus(
    tournamentConfig: unknown,
    fallbackStatus: string,
  ) {
    if (!tournamentConfig || typeof tournamentConfig !== 'object' || Array.isArray(tournamentConfig)) {
      return fallbackStatus;
    }

    const previousStatus = (tournamentConfig as { previousStatus?: unknown }).previousStatus;
    return typeof previousStatus === 'string' && previousStatus.length > 0
      ? previousStatus
      : fallbackStatus;
  }

  private async logTournamentAdminAction(params: {
    adminId: string;
    action: string;
    tournamentId: string;
    oldValues: Record<string, unknown>;
    newValues: Record<string, unknown>;
  }) {
    await this.db.insert(schema.auditLogs).values({
      userId: params.adminId,
      action: params.action,
      tableName: 'tournaments',
      recordId: params.tournamentId,
      oldValues: params.oldValues,
      newValues: params.newValues,
    });
  }

  async getMetrics(groupBy: 'day' | 'week' | 'month' | 'year' = 'month') {
    const intervalStr = groupBy === 'day' ? '1 day' : groupBy === 'week' ? '7 days' : groupBy === 'year' ? '365 days' : '30 days';

    // 1. GMV & Net Revenue & Transactions Count
    const [paymentsSumTotal] = await this.db
      .select({
        gmv: sql<string>`coalesce(sum(${schema.payments.amount}), '0')`,
        netRevenue: sql<string>`coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
        transactionsCount: sql<number>`count(*)::int`,
      })
      .from(schema.payments)
      .where(eq(schema.payments.status, 'COMPLETED'));

    const [paymentsSumCurrent] = await this.db
      .select({
        gmv: sql<string>`coalesce(sum(${schema.payments.amount}), '0')`,
        netRevenue: sql<string>`coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
        transactionsCount: sql<number>`count(*)::int`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.status, 'COMPLETED'),
          sql`${schema.payments.paidAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)}`
        )
      );

    const [paymentsSumPrev] = await this.db
      .select({
        gmv: sql<string>`coalesce(sum(${schema.payments.amount}), '0')`,
        netRevenue: sql<string>`coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
        transactionsCount: sql<number>`count(*)::int`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.status, 'COMPLETED'),
          sql`${schema.payments.paidAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)} * 2`,
          sql`${schema.payments.paidAt} < now() - interval ${sql.raw(`'${intervalStr}'`)}`
        )
      );

    // 2. Held Escrow
    const [escrowSumTotal] = await this.db
      .select({
        heldEscrow: sql<string>`coalesce(sum(${schema.organizerPayouts.amountRequested}), '0')`,
      })
      .from(schema.organizerPayouts)
      .where(eq(schema.organizerPayouts.status, 'HELD_IN_ESCROW'));

    const [escrowSumCurrent] = await this.db
      .select({
        heldEscrow: sql<string>`coalesce(sum(${schema.organizerPayouts.amountRequested}), '0')`,
      })
      .from(schema.organizerPayouts)
      .where(
        and(
          eq(schema.organizerPayouts.status, 'HELD_IN_ESCROW'),
          sql`${schema.organizerPayouts.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)}`
        )
      );

    const [escrowSumPrev] = await this.db
      .select({
        heldEscrow: sql<string>`coalesce(sum(${schema.organizerPayouts.amountRequested}), '0')`,
      })
      .from(schema.organizerPayouts)
      .where(
        and(
          eq(schema.organizerPayouts.status, 'HELD_IN_ESCROW'),
          sql`${schema.organizerPayouts.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)} * 2`,
          sql`${schema.organizerPayouts.createdAt} < now() - interval ${sql.raw(`'${intervalStr}'`)}`
        )
      );

    // 3. Users (Exclude Mock Users)
    const [usersTotal] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(eq(schema.users.isMock, false));
    const [usersCurrent] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.isMock, false),
          sql`${schema.users.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)}`
        )
      );
    const [usersPrev] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.isMock, false),
          sql`${schema.users.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)} * 2`,
          sql`${schema.users.createdAt} < now() - interval ${sql.raw(`'${intervalStr}'`)}`
        )
      );

    // 4. Communities (Exclude Soft Deleted)
    const [communitiesTotal] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.communities)
      .where(isNull(schema.communities.deletedAt));
    const [communitiesCurrent] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.communities)
      .where(
        and(
          isNull(schema.communities.deletedAt),
          sql`${schema.communities.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)}`
        )
      );
    const [communitiesPrev] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.communities)
      .where(
        and(
          isNull(schema.communities.deletedAt),
          sql`${schema.communities.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)} * 2`,
          sql`${schema.communities.createdAt} < now() - interval ${sql.raw(`'${intervalStr}'`)}`
        )
      );

    // 5. Tournaments (Exclude Soft Deleted)
    const [tournamentsTotal] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.tournaments)
      .where(isNull(schema.tournaments.deletedAt));
    const [tournamentsCurrent] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.tournaments)
      .where(
        and(
          isNull(schema.tournaments.deletedAt),
          sql`${schema.tournaments.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)}`
        )
      );
    const [tournamentsPrev] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.tournaments)
      .where(
        and(
          isNull(schema.tournaments.deletedAt),
          sql`${schema.tournaments.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)} * 2`,
          sql`${schema.tournaments.createdAt} < now() - interval ${sql.raw(`'${intervalStr}'`)}`
        )
      );

    // Calculate growth percentages
    const calcGrowth = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
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

  async getRevenueChart(
    groupBy: 'day' | 'week' | 'month' | 'year' = 'month',
    startDate?: string,
    endDate?: string,
  ) {
    const truncateUnit = groupBy === 'day' ? 'day' : groupBy === 'week' ? 'week' : groupBy === 'year' ? 'year' : 'month';
    const conditions: SQL[] = [eq(schema.payments.status, 'COMPLETED')];

    if (startDate) {
      conditions.push(gte(schema.payments.paidAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(schema.payments.paidAt, new Date(endDate)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await this.db
      .select({
        period: sql<string>`date_trunc(${sql.raw(`'${truncateUnit}'`)}, "payments"."paid_at")`,
        gmv: sql<string>`coalesce(sum(${schema.payments.amount}), '0')`,
        revenue: sql<string>`coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.payments)
      .where(whereClause)
      .groupBy(sql`date_trunc(${sql.raw(`'${truncateUnit}'`)}, "payments"."paid_at")`)
      .orderBy(sql`date_trunc(${sql.raw(`'${truncateUnit}'`)}, "payments"."paid_at")`);

    return results.map((row) => ({
      period: row.period,
      gmv: parseFloat(row.gmv),
      revenue: parseFloat(row.revenue),
      count: row.count,
    }));
  }

  async getAuditLogs(page: number = 1, limit: number = 10, search?: string, userId?: string) {
    const offset = (page - 1) * limit;
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(
        or(
          ilike(schema.auditLogs.tableName, `%${search}%`),
          ilike(schema.auditLogs.action, `%${search}%`),
        ) as SQL,
      );
    }
    if (userId) {
      conditions.push(eq(schema.auditLogs.userId, userId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.auditLogs)
      .where(whereClause);

    const data = await this.db
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
      .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.auditLogs.createdAt));

    return {
      data,
      meta: {
        total: totalRecord.count,
        page,
        limit,
        totalPages: Math.ceil(totalRecord.count / limit),
      },
    };
  }

  // ─── Verification Tickets ─────────────────────────────────────

  async submitVerificationTicket(userId: string, evidenceUrls: string[], contactPhone: string) {
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

  async listVerificationTickets(status?: string, page = 1, limit = 10, cursor?: string) {
    const conditions: SQL[] = [];
    if (status) {
      conditions.push(eq(schema.verificationTickets.status, status));
    }
    const baseWhereClause = conditions.length > 0 ? and(...conditions) : undefined;
    let whereClause = baseWhereClause;
    let ticketCursor: { createdAt: string; id: string } | null = null;
    if (cursor) {
      try {
        ticketCursor = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { createdAt: string; id: string };
      } catch {
        ticketCursor = null;
      }
    }
    if (ticketCursor) {
      const cursorDate = new Date(ticketCursor.createdAt);
      whereClause = and(
        baseWhereClause,
        sql`(${schema.verificationTickets.createdAt} < ${cursorDate} OR (${schema.verificationTickets.createdAt} = ${cursorDate} AND ${schema.verificationTickets.id} < ${ticketCursor.id}))`,
      );
    }
    const offset = (page - 1) * limit;

    const [totalRecord] = await this.db
      .select({ count: count() })
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
      .innerJoin(schema.users, eq(schema.verificationTickets.userId, schema.users.id))
      .innerJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(whereClause)
      .orderBy(desc(schema.verificationTickets.createdAt), desc(schema.verificationTickets.id))
      .limit(limit + 1)
      .$dynamic();
    if (!cursor) ticketsQuery = ticketsQuery.offset(offset);
    const ticketRows = await ticketsQuery;
    const hasMore = ticketRows.length > limit;
    const data = hasMore ? ticketRows.slice(0, limit) : ticketRows;
    const lastTicket = ticketRows.length > 0
      ? ticketRows[ticketRows.length - 1] as { ticket: { createdAt: Date; id: string } }
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

  async approveVerificationTicket(ticketId: string, adminId: string) {
    const [ticket] = await this.db
      .select()
      .from(schema.verificationTickets)
      .where(eq(schema.verificationTickets.id, ticketId))
      .limit(1);

    if (!ticket) throw new NotFoundException('Verification ticket not found');
    if (ticket.status !== 'PENDING') throw new BadRequestException('Ticket is already processed');

    const notification = buildVerificationApprovedNotification({
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
        .where(eq(schema.verificationTickets.id, ticketId))
        .returning();

      await tx
        .update(schema.profiles)
        .set({
          isVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.profiles.userId, ticket.userId));

      // Auto-assign ORGANIZER role
      const [organizerRole] = await tx
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.slug, 'organizer'))
        .limit(1);

      if (organizerRole) {
        const [existingUserRole] = await tx
          .select()
          .from(schema.userToRoles)
          .where(
            and(
              eq(schema.userToRoles.userId, ticket.userId),
              eq(schema.userToRoles.roleId, organizerRole.id)
            )
          )
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

  async rejectVerificationTicket(ticketId: string, adminId: string, rejectReason: string) {
    const [ticket] = await this.db
      .select()
      .from(schema.verificationTickets)
      .where(eq(schema.verificationTickets.id, ticketId))
      .limit(1);

    if (!ticket) throw new NotFoundException('Verification ticket not found');
    if (ticket.status !== 'PENDING') throw new BadRequestException('Ticket is already processed');

    const [updatedTicket] = await this.db
      .update(schema.verificationTickets)
      .set({
        status: 'REJECTED',
        rejectReason,
        reviewedBy: adminId,
        updatedAt: new Date(),
      })
      .where(eq(schema.verificationTickets.id, ticketId))
      .returning();

    await this.db.insert(schema.auditLogs).values({
      userId: adminId,
      action: 'VERIFICATION_REJECT',
      tableName: 'verification_tickets',
      recordId: ticketId,
      oldValues: ticket,
      newValues: updatedTicket,
    });

    await this.notificationsService.sendNotification(
      buildVerificationRejectedNotification({
        receiverId: ticket.userId,
        reason: rejectReason,
      }),
    );

    return updatedTicket;
  }

  // ─── Moderation & Bans ────────────────────────────────────────

  async banUser(userId: string, adminId: string, reason: string, banType: 'WARN' | 'SOFT_BAN' | 'HARD_BAN', expiresAt?: string) {
    const expiry = expiresAt ? new Date(expiresAt) : null;
    const [banRecord] = await this.db
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

    // If Hard Ban, suspend any community/club owned by the user
    if (banType === 'HARD_BAN') {
      await this.db
        .update(schema.communities)
        .set({
          status: 'SUSPENDED',
          updatedAt: new Date(),
        })
        .where(eq(schema.communities.creatorId, userId));
    }

    await this.db.insert(schema.auditLogs).values({
      userId: adminId,
      action: `USER_BAN_${banType}`,
      tableName: 'user_bans',
      recordId: banRecord.id,
      newValues: banRecord,
    });

    await this.notificationsService.sendNotification(
      buildUserBannedNotification({
        receiverId: userId,
        reason,
        banType,
      }),
    );

    return banRecord;
  }

  async unbanUser(userId: string, adminId: string) {
    const bans = await this.db
      .update(schema.userBans)
      .set({ isActive: false })
      .where(and(eq(schema.userBans.userId, userId), eq(schema.userBans.isActive, true)))
      .returning();

    // Re-activate community/club if soft/hard bans are cleared
    await this.db
      .update(schema.communities)
      .set({
        status: 'ACTIVE',
        updatedAt: new Date(),
      })
      .where(eq(schema.communities.creatorId, userId));

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
      await this.notificationsService.sendNotification(
        buildUserUnbannedNotification({
          receiverId: userId,
        }),
      );
    }

    return { success: true, bansUnbanned: bans.length };
  }

  // ─── System Configs ───────────────────────────────────────────

  async getConfigs() {
    await this.getOrInitConfig(
      'ALLOW_TOURNAMENT_ENTRY_FEES',
      'true',
      'Cho phép ban tổ chức đặt lệ phí đăng ký cho giải đấu mới hoặc khi chỉnh sửa giải.',
    );
    return this.db.select().from(schema.systemConfigs);
  }

  async updateConfig(key: string, value: string, description: string, adminId: string) {
    if (
      key === 'ALLOW_TOURNAMENT_ENTRY_FEES' &&
      !['true', 'false'].includes(value.trim().toLowerCase())
    ) {
      throw new BadRequestException('ALLOW_TOURNAMENT_ENTRY_FEES chỉ nhận giá trị true hoặc false');
    }

    const normalizedValue = key === 'ALLOW_TOURNAMENT_ENTRY_FEES'
      ? value.trim().toLowerCase()
      : value;
    const [existing] = await this.db
      .select()
      .from(schema.systemConfigs)
      .where(eq(schema.systemConfigs.key, key))
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
        .where(eq(schema.systemConfigs.key, key))
        .returning();
    } else {
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
      recordId: sql`gen_random_uuid()`, // System config doesn't have uuid primary key, use random for recordId
      oldValues: existing || null,
      newValues: configRecord,
    });

    return configRecord;
  }

  async getOrInitConfig(key: string, defaultValue: string, description?: string): Promise<string> {
    const [existing] = await this.db
      .select()
      .from(schema.systemConfigs)
      .where(eq(schema.systemConfigs.key, key))
      .limit(1);

    if (existing) {
      return existing.value;
    }

    const [anyUser] = await this.db.select({ id: schema.users.id }).from(schema.users).limit(1);
    if (!anyUser) return defaultValue;

    try {
      await this.db.insert(schema.systemConfigs).values({
        key,
        value: defaultValue,
        description: description || '',
        updatedBy: anyUser.id,
      });
    } catch (err) {
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
      allowEntryFees: (await this.getOrInitConfig(
        'ALLOW_TOURNAMENT_ENTRY_FEES',
        'true',
        'Cho phép ban tổ chức đặt lệ phí đăng ký cho giải đấu mới hoặc khi chỉnh sửa giải.',
      )).toLowerCase() === 'true',
    };
  }

  async listReports(query: QueryReportsDto) {
    const offset = (query.page - 1) * query.limit;
    const reporterUser = aliasedTable(schema.users, 'reporter_user');
    const reporterProfile = aliasedTable(schema.profiles, 'reporter_profile');
    const targetUser = aliasedTable(schema.users, 'target_user');
    const targetUserProfile = aliasedTable(schema.profiles, 'target_user_profile');
    const targetTournament = aliasedTable(schema.tournaments, 'target_tournament');
    const targetMatch = aliasedTable(schema.matches, 'target_match');
    const targetCommunity = aliasedTable(schema.communities, 'target_community');
    const assignedUser = aliasedTable(schema.users, 'assigned_user');
    const assignedProfile = aliasedTable(schema.profiles, 'assigned_profile');

    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(schema.reports.status, query.status));
    if (query.targetType) {
      conditions.push(eq(schema.reports.targetType, query.targetType));
    }
    if (query.category) {
      conditions.push(eq(schema.reports.category, query.category));
    }
    if (query.from) {
      conditions.push(gte(schema.reports.createdAt, new Date(query.from)));
    }
    if (query.to) {
      conditions.push(lte(schema.reports.createdAt, new Date(query.to)));
    }
    if (query.search?.trim()) {
      const keyword = `%${query.search.trim()}%`;
      conditions.push(
        or(
          ilike(schema.reports.reason, keyword),
          ilike(reporterUser.email, keyword),
          ilike(reporterProfile.fullName, keyword),
          ilike(targetUser.email, keyword),
          ilike(targetUserProfile.fullName, keyword),
          ilike(targetTournament.name, keyword),
          ilike(targetCommunity.name, keyword),
        )!,
      );
    }
    const baseWhereClause = conditions.length > 0 ? and(...conditions) : undefined;
    let whereClause = baseWhereClause;
    let reportCursor: { createdAt: string; id: string } | null = null;
    if (query.cursor) {
      try {
        reportCursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as { createdAt: string; id: string };
      } catch {
        reportCursor = null;
      }
    }
    if (reportCursor) {
      const cursorDate = new Date(reportCursor.createdAt);
      whereClause = and(
        baseWhereClause,
        sql`(${schema.reports.createdAt} < ${cursorDate} OR (${schema.reports.createdAt} = ${cursorDate} AND ${schema.reports.id} < ${reportCursor.id}))`,
      );
    }

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.reports)
      .innerJoin(reporterUser, eq(schema.reports.reporterId, reporterUser.id))
      .leftJoin(reporterProfile, eq(reporterUser.id, reporterProfile.userId))
      .leftJoin(targetUser, and(eq(schema.reports.targetType, 'USER'), eq(schema.reports.targetId, targetUser.id)))
      .leftJoin(targetUserProfile, eq(targetUser.id, targetUserProfile.userId))
      .leftJoin(targetTournament, and(eq(schema.reports.targetType, 'TOURNAMENT'), eq(schema.reports.targetId, targetTournament.id)))
      .leftJoin(targetMatch, and(eq(schema.reports.targetType, 'MATCH'), eq(schema.reports.targetId, targetMatch.id)))
      .leftJoin(targetCommunity, and(eq(schema.reports.targetType, 'COMMUNITY'), eq(schema.reports.targetId, targetCommunity.id)))
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
      .innerJoin(reporterUser, eq(schema.reports.reporterId, reporterUser.id))
      .leftJoin(reporterProfile, eq(reporterUser.id, reporterProfile.userId))
      .leftJoin(targetUser, and(eq(schema.reports.targetType, 'USER'), eq(schema.reports.targetId, targetUser.id)))
      .leftJoin(targetUserProfile, eq(targetUser.id, targetUserProfile.userId))
      .leftJoin(targetTournament, and(eq(schema.reports.targetType, 'TOURNAMENT'), eq(schema.reports.targetId, targetTournament.id)))
      .leftJoin(targetMatch, and(eq(schema.reports.targetType, 'MATCH'), eq(schema.reports.targetId, targetMatch.id)))
      .leftJoin(targetCommunity, and(eq(schema.reports.targetType, 'COMMUNITY'), eq(schema.reports.targetId, targetCommunity.id)))
      .leftJoin(assignedUser, eq(schema.reports.assignedTo, assignedUser.id))
      .leftJoin(assignedProfile, eq(assignedUser.id, assignedProfile.userId))
      .where(whereClause)
      .orderBy(desc(schema.reports.createdAt), desc(schema.reports.id))
      .limit(query.limit + 1)
      .$dynamic();
    if (!query.cursor) reportsQuery = reportsQuery.offset(offset);
    const reportRows = await reportsQuery;
    const hasMore = reportRows.length > query.limit;
    const data = hasMore ? reportRows.slice(0, query.limit) : reportRows;
    const lastReport = reportRows.length > 0
      ? reportRows[reportRows.length - 1] as { createdAt: Date; id: string }
      : undefined;

    const total = Number((totalRecord as { count?: number | string } | undefined)?.count ?? 0);

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

  async getReportActions(reportId: string) {
    const [report] = await this.db
      .select({ id: schema.reports.id })
      .from(schema.reports)
      .where(eq(schema.reports.id, reportId))
      .limit(1);
    if (!report) {
      throw new NotFoundException('Không tìm thấy báo cáo vi phạm');
    }

    const actorUser = aliasedTable(schema.users, 'report_action_actor');
    const actorProfile = aliasedTable(schema.profiles, 'report_action_profile');
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
      .leftJoin(actorUser, eq(schema.reportActions.actorId, actorUser.id))
      .leftJoin(actorProfile, eq(actorUser.id, actorProfile.userId))
      .where(eq(schema.reportActions.reportId, reportId))
      .orderBy(asc(schema.reportActions.createdAt));
  }

  private async transitionReport(params: {
    reportId: string;
    actorId: string;
    action: string;
    expectedStatuses: ReportStatus[];
    targetStatus: ReportStatus;
    note: string;
    category?: ReportCategory;
  }) {
    const updatedReport = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.id, params.reportId))
        .limit(1);

      if (!current) {
        throw new NotFoundException('Không tìm thấy báo cáo vi phạm');
      }
      if (!params.expectedStatuses.includes(current.status as ReportStatus)) {
        throw new BadRequestException(
          `Không thể chuyển báo cáo từ trạng thái ${current.status} sang ${params.targetStatus}`,
        );
      }

      const isFinal = ['RESOLVED', 'REJECTED'].includes(params.targetStatus);
      const [updated] = await tx
        .update(schema.reports)
        .set({
          status: params.targetStatus,
          category: params.category ?? current.category,
          assignedTo: params.actorId,
          triagedAt:
            params.targetStatus === 'TRIAGED'
              ? new Date()
              : current.triagedAt,
          resolvedBy: isFinal ? params.actorId : current.resolvedBy,
          resolutionNote: isFinal ? params.note : current.resolutionNote,
          resolvedAt: isFinal ? new Date() : current.resolvedAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.reports.id, params.reportId),
            eq(schema.reports.status, current.status),
          ),
        )
        .returning();

      if (!updated) {
        throw new ConflictException(
          'Báo cáo vừa được người khác cập nhật, vui lòng tải lại dữ liệu',
        );
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

  private async sendReportStatusNotification(
    report: typeof schema.reports.$inferSelect,
  ) {
    const contentByStatus: Record<string, string> = {
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
    } catch (error) {
      console.error('Không thể gửi thông báo trạng thái báo cáo:', error);
    }
  }

  async triageReport(reportId: string, moderatorId: string, note: string, category?: ReportCategory) {
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

  async startReportReview(reportId: string, moderatorId: string, note: string) {
    return this.transitionReport({
      reportId,
      actorId: moderatorId,
      action: 'START_REVIEW',
      expectedStatuses: ['SUBMITTED', 'TRIAGED'],
      targetStatus: 'UNDER_REVIEW',
      note,
    });
  }

  async escalateReport(reportId: string, moderatorId: string, note: string) {
    return this.transitionReport({
      reportId,
      actorId: moderatorId,
      action: 'ESCALATE',
      expectedStatuses: ['SUBMITTED', 'TRIAGED', 'UNDER_REVIEW'],
      targetStatus: 'ESCALATED',
      note,
    });
  }

  async resolveReport(
    reportId: string,
    actorId: string,
    status: 'RESOLVED' | 'REJECTED',
    resolutionNote: string,
    isAdmin: boolean,
    category?: ReportCategory,
  ) {
    const expectedStatuses: ReportStatus[] = isAdmin
      ? ['SUBMITTED', 'TRIAGED', 'UNDER_REVIEW', 'ESCALATED']
      : ['SUBMITTED', 'TRIAGED', 'UNDER_REVIEW'];

    if (status === 'RESOLVED' && !isAdmin) {
      const [report] = await this.db
        .select({ status: schema.reports.status })
        .from(schema.reports)
        .where(eq(schema.reports.id, reportId))
        .limit(1);
      if (report?.status === 'ESCALATED') {
        throw new BadRequestException(
          'Báo cáo đã chuyển cấp chỉ quản trị viên mới được kết luận',
        );
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

  async suspendTournament(tournamentId: string, adminId: string, note?: string) {
    const [tournament] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.status === 'SUSPENDED' || tournament.status === 'CANCELLED') {
      throw new BadRequestException('Tournament is already suspended or cancelled');
    }

    // Save previous status inside tournamentConfig JSON
    const currentConfig =
      tournament.tournamentConfig && typeof tournament.tournamentConfig === 'object' && !Array.isArray(tournament.tournamentConfig)
        ? (tournament.tournamentConfig as Record<string, unknown>)
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
      .where(eq(schema.tournaments.id, tournamentId))
      .returning();

    await this.notificationsService.sendNotification(
      buildTournamentSuspendedNotification({
        receiverId: tournament.createdBy,
        tournamentId,
        tournamentName: tournament.name,
        reason: note,
      }),
    );

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

  async unsuspendTournament(tournamentId: string, adminId: string) {
    const [tournament] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.status !== 'SUSPENDED') {
      throw new BadRequestException('Tournament is not suspended');
    }

    // Restore previous status from tournamentConfig
    const restoreStatus = this.extractTournamentPreviousStatus(
      tournament.tournamentConfig,
      'UPCOMING',
    );

    const [updatedTournament] = await this.db
      .update(schema.tournaments)
      .set({
        status: restoreStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.tournaments.id, tournamentId))
      .returning();

    await this.notificationsService.sendNotification(
      buildTournamentUnsuspendedNotification({
        receiverId: tournament.createdBy,
        tournamentId,
        tournamentName: tournament.name,
      }),
    );

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

  async approveTournament(tournamentId: string, adminId: string) {
    const [tournament] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Tournament is not pending approval');
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
      .where(eq(schema.tournaments.id, tournamentId))
      .returning();

    await this.notificationsService.sendNotification(
      buildTournamentPublishApprovedNotification({
        receiverId: tournament.createdBy,
        tournamentId,
        tournamentName: tournament.name,
      }),
    );

    await this.logTournamentAdminAction({
      adminId,
      action: 'TOURNAMENT_APPROVE',
      tournamentId,
      oldValues: { status: tournament.status },
      newValues: { status: updatedTournament.status },
    });

    return updatedTournament;
  }

  async rejectTournament(tournamentId: string, adminId: string, note?: string) {
    const [tournament] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Tournament is not pending approval');
    }

    const [updatedTournament] = await this.db
      .update(schema.tournaments)
      .set({
        status: 'CANCELLED',
        updatedAt: new Date(),
      })
      .where(eq(schema.tournaments.id, tournamentId))
      .returning();

    await this.notificationsService.sendNotification(
      buildTournamentPublishRejectedNotification({
        receiverId: tournament.createdBy,
        tournamentId,
        tournamentName: tournament.name,
        reason: note,
      }),
    );

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

  async banTournament(tournamentId: string, adminId: string, note?: string) {
    const [tournament] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    // Save previous status inside tournamentConfig JSON
    const currentConfig =
      tournament.tournamentConfig && typeof tournament.tournamentConfig === 'object' && !Array.isArray(tournament.tournamentConfig)
        ? (tournament.tournamentConfig as Record<string, unknown>)
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
      .where(eq(schema.tournaments.id, tournamentId))
      .returning();

    await this.notificationsService.sendNotification(
      buildTournamentCancelledNotification({
        receiverId: tournament.createdBy,
        tournamentId,
        tournamentName: tournament.name,
      }),
    );

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

  async approveDeleteTournament(tournamentId: string, adminId: string) {
    const [tournament] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.status !== 'PENDING_DELETE') {
      throw new BadRequestException('Tournament deletion is not pending approval');
    }

    // Check payment safety before approving delete
    const [paidCount] = await this.db
      .select({ count: count() })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.payments.status, 'COMPLETED'),
        ),
      );
    const paidPayments = paidCount?.count || 0;

    const [nonRefundedCount] = await this.db
      .select({ count: count() })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.payments.status, 'COMPLETED'),
          sql`${schema.payments.refundStatus} IS DISTINCT FROM 'REFUNDED'`,
        ),
      );
    const nonRefundedPayments = nonRefundedCount?.count || 0;
    const fullyRefunded = nonRefundedPayments === 0;

    if (paidPayments > 0 && !fullyRefunded) {
      throw new BadRequestException(
        'Không thể xóa giải đấu vì chưa hoàn tiền đầy đủ cho tất cả vận động viên.',
      );
    }

    // Check for pending refund requests
    const [pendingRefundCount] = await this.db
      .select({ count: count() })
      .from(schema.paymentRefunds)
      .innerJoin(
        schema.payments,
        eq(schema.paymentRefunds.paymentId, schema.payments.id),
      )
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.paymentRefunds.status, 'REQUESTED'),
        ),
      );
    const pendingRefunds = pendingRefundCount?.count || 0;

    if (pendingRefunds > 0) {
      throw new BadRequestException(
        'Không thể xóa giải đấu vì còn giao dịch đang chờ hoàn tiền.',
      );
    }

    const deletedTournament = await this.db.transaction(async (tx) => {
      const [deleted] = await tx
        .update(schema.tournaments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.tournaments.id, tournamentId))
        .returning();

      const stages = await tx
        .select({ id: schema.tournamentStages.id })
        .from(schema.tournamentStages)
        .where(eq(schema.tournamentStages.tournamentId, tournamentId));
      const stageIds = stages.map((s) => s.id);

      if (stageIds.length > 0) {
        const groups = await tx
          .select({ id: schema.tournamentGroups.id })
          .from(schema.tournamentGroups)
          .where(inArray(schema.tournamentGroups.stageId, stageIds));
        const groupIds = groups.map((g) => g.id);

        if (groupIds.length > 0) {
          await tx
            .update(schema.matches)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(inArray(schema.matches.groupId, groupIds));
        }
      }

      // Delete any notifications referencing this tournament
      await tx
        .delete(schema.notifications)
        .where(like(schema.notifications.redirectUrl, `%/${tournamentId}%`));

      if (tournament.parentId) {
        const siblings = await tx
          .select()
          .from(schema.tournaments)
          .where(
            and(
              eq(schema.tournaments.parentId, tournament.parentId),
              isNull(schema.tournaments.deletedAt),
            ),
          );
        if (siblings.length === 0) {
          await tx
            .update(schema.parentTournaments)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(eq(schema.parentTournaments.id, tournament.parentId));

          // Delete notifications referencing the parent tournament too
          await tx
            .delete(schema.notifications)
            .where(like(schema.notifications.redirectUrl, `%/${tournament.parentId}%`));
        }
      }

      return deleted;
    });

    await this.notificationsService.sendNotification(
      buildTournamentDeleteApprovedNotification({
        receiverId: tournament.createdBy,
        tournamentName: tournament.name,
      }),
    );

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

  async rejectDeleteTournament(tournamentId: string, adminId: string, note?: string) {
    const [tournament] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    if (tournament.status !== 'PENDING_DELETE') {
      throw new BadRequestException('Tournament deletion is not pending approval');
    }

    const restoredStatus = this.extractTournamentPreviousStatus(
      tournament.tournamentConfig,
      'REGISTRATION_OPEN',
    );

    const [updatedTournament] = await this.db
      .update(schema.tournaments)
      .set({
        status: restoredStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.tournaments.id, tournamentId))
      .returning();

    await this.notificationsService.sendNotification(
      buildTournamentDeleteRejectedNotification({
        receiverId: tournament.createdBy,
        tournamentId,
        tournamentName: tournament.name,
        reason: note,
      }),
    );

    if (tournament.parentId) {
      const siblingTournaments = await this.db
        .select({
          id: schema.tournaments.id,
          tournamentConfig: schema.tournaments.tournamentConfig,
        })
        .from(schema.tournaments)
        .where(
          and(
            eq(schema.tournaments.parentId, tournament.parentId),
            eq(schema.tournaments.status, 'PENDING_DELETE'),
            isNull(schema.tournaments.deletedAt),
          ),
        );

      for (const sibling of siblingTournaments) {
        const siblingRestoreStatus = this.extractTournamentPreviousStatus(
          sibling.tournamentConfig,
          restoredStatus,
        );

        await this.db
          .update(schema.tournaments)
          .set({
            status: siblingRestoreStatus,
            updatedAt: new Date(),
          })
          .where(eq(schema.tournaments.id, sibling.id));
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

  async listTournaments(page = 1, limit = 10, search?: string, status?: string, cursor?: string) {
    const offset = (page - 1) * limit;
    const conditions: SQL[] = [isNull(schema.tournaments.deletedAt)];

    if (search) {
      conditions.push(ilike(schema.tournaments.name, `%${search}%`));
    }

    if (status) {
      if (status === 'ONGOING') {
        conditions.push(
          inArray(schema.tournaments.status, [
            'UPCOMING',
            'REGISTRATION_OPEN',
            'REGISTRATION_CLOSED',
            'IN_PROGRESS',
          ]),
        );
      } else {
        conditions.push(eq(schema.tournaments.status, status));
      }
    }

    const baseWhereClause = and(...conditions);
    let whereClause = baseWhereClause;
    let tournamentCursor: { createdAt: string; id: string } | null = null;
    if (cursor) {
      try {
        tournamentCursor = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { createdAt: string; id: string };
      } catch {
        tournamentCursor = null;
      }
    }
    if (tournamentCursor) {
      const cursorDate = new Date(tournamentCursor.createdAt);
      whereClause = and(
        baseWhereClause,
        sql`(${schema.tournaments.createdAt} < ${cursorDate} OR (${schema.tournaments.createdAt} = ${cursorDate} AND ${schema.tournaments.id} < ${tournamentCursor.id}))`,
      );
    }

    const [totalRecord] = await this.db
      .select({ count: count() })
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
      .leftJoin(schema.users, eq(schema.tournaments.createdBy, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(whereClause)
      .orderBy(desc(schema.tournaments.createdAt), desc(schema.tournaments.id))
      .limit(limit + 1)
      .$dynamic();
    if (!cursor) tournamentsQuery = tournamentsQuery.offset(offset);
    const tournamentRows = await tournamentsQuery;
    const hasMore = tournamentRows.length > limit;
    const data = hasMore ? tournamentRows.slice(0, limit) : tournamentRows;
    const lastTournament = tournamentRows.length > 0
      ? tournamentRows[tournamentRows.length - 1] as { createdAt: Date; id: string }
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

  async getUserVerificationTickets(userId: string) {
    return this.db
      .select()
      .from(schema.verificationTickets)
      .where(eq(schema.verificationTickets.userId, userId))
      .orderBy(desc(schema.verificationTickets.createdAt));
  }
}
