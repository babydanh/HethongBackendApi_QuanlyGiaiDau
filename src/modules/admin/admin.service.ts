import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, desc, sql, or, ilike, count, SQL, asc, gte, lte, inArray, isNull, aliasedTable } from 'drizzle-orm';
import { EloEngineService } from '../rankings/elo-engine.service';
import { RankingsService } from '../rankings/rankings.service';
import { OriginalMatchValues } from './interfaces/original-match-values.interface';
import { NotificationsService } from '../notifications/notifications.service';
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

    // 3. Users
    const [usersTotal] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
    const [usersCurrent] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.users).where(sql`${schema.users.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)}`);
    const [usersPrev] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.users).where(and(sql`${schema.users.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)} * 2`, sql`${schema.users.createdAt} < now() - interval ${sql.raw(`'${intervalStr}'`)}`));

    // 4. Communities
    const [communitiesTotal] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.communities);
    const [communitiesCurrent] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.communities).where(sql`${schema.communities.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)}`);
    const [communitiesPrev] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.communities).where(and(sql`${schema.communities.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)} * 2`, sql`${schema.communities.createdAt} < now() - interval ${sql.raw(`'${intervalStr}'`)}`));

    // 5. Tournaments
    const [tournamentsTotal] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.tournaments);
    const [tournamentsCurrent] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.tournaments).where(sql`${schema.tournaments.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)}`);
    const [tournamentsPrev] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.tournaments).where(and(sql`${schema.tournaments.createdAt} >= now() - interval ${sql.raw(`'${intervalStr}'`)} * 2`, sql`${schema.tournaments.createdAt} < now() - interval ${sql.raw(`'${intervalStr}'`)}`));

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
        change: calcGrowth(usersCurrent.count, usersPrev.count),
      },
      totalCommunities: {
        value: communitiesTotal.count,
        change: calcGrowth(communitiesCurrent.count, communitiesPrev.count),
      },
      totalTournaments: {
        value: tournamentsTotal.count,
        change: calcGrowth(tournamentsCurrent.count, tournamentsPrev.count),
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

  async listVerificationTickets(status?: string, page = 1, limit = 10) {
    const conditions: SQL[] = [];
    if (status) {
      conditions.push(eq(schema.verificationTickets.status, status));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * limit;

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.verificationTickets)
      .where(whereClause);

    const data = await this.db
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
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.verificationTickets.createdAt));

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
    return this.db.select().from(schema.systemConfigs);
  }

  async updateConfig(key: string, value: string, description: string, adminId: string) {
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
          value,
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
          value,
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
      feePublicRanked: parseFloat(await this.getOrInitConfig('TOURNAMENT_PUBLISH_FEE_PUBLIC_RANKED', '100000')),
      feePublicUnranked: parseFloat(await this.getOrInitConfig('TOURNAMENT_PUBLISH_FEE_PUBLIC_UNRANKED', '50000')),
      feeClub: parseFloat(await this.getOrInitConfig('TOURNAMENT_PUBLISH_FEE_CLUB', '0')),
      pctPublicRanked: parseFloat(await this.getOrInitConfig('PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED', '5')),
      pctPublicUnranked: parseFloat(await this.getOrInitConfig('PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED', '5')),
      pctClub: parseFloat(await this.getOrInitConfig('PLATFORM_FEE_PERCENTAGE_CLUB', '0')),
    };
  }

  // ─── Dispute Revert & ELO Recalculation Cascade ───────────────

  async listDisputes(page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.matchDisputes);

    const data = await this.db
      .select({
        dispute: schema.matchDisputes,
        match: schema.matches,
        filedByUser: {
          id: schema.users.id,
          email: schema.users.email,
          fullName: schema.profiles.fullName,
        },
      })
      .from(schema.matchDisputes)
      .innerJoin(schema.matches, eq(schema.matchDisputes.matchId, schema.matches.id))
      .innerJoin(schema.users, eq(schema.matchDisputes.filedBy, schema.users.id))
      .innerJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.matchDisputes.createdAt));

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

  async getDisputeDiff(disputeId: string) {
    const [dispute] = await this.db
      .select()
      .from(schema.matchDisputes)
      .where(eq(schema.matchDisputes.id, disputeId))
      .limit(1);

    if (!dispute) {
      throw new NotFoundException('Không tìm thấy khiếu nại tranh chấp.');
    }

    const [match] = await this.db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, dispute.matchId))
      .limit(1);

    if (!match) {
      throw new NotFoundException('Không tìm thấy trận đấu liên quan.');
    }

    let p1Name = 'Người chơi 1';
    let p2Name = 'Người chơi 2';

    if (match.participant1Id) {
      const [p1] = await this.db
        .select({ teamName: schema.tournamentParticipants.teamName })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, match.participant1Id))
        .limit(1);
      if (p1?.teamName) p1Name = p1.teamName;
    }

    if (match.participant2Id) {
      const [p2] = await this.db
        .select({ teamName: schema.tournamentParticipants.teamName })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, match.participant2Id))
        .limit(1);
      if (p2?.teamName) p2Name = p2.teamName;
    }

    // Find the oldest audit log to get the original values
    const [oldestLog] = await this.db
      .select({
        id: schema.auditLogs.id,
        oldValues: schema.auditLogs.oldValues,
        newValues: schema.auditLogs.newValues,
        createdAt: schema.auditLogs.createdAt,
        user: {
          email: schema.users.email,
          fullName: schema.profiles.fullName,
        }
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(
        and(
          eq(schema.auditLogs.tableName, 'matches'),
          eq(schema.auditLogs.recordId, match.id)
        )
      )
      .orderBy(asc(schema.auditLogs.createdAt))
      .limit(1);

    return {
      dispute,
      match: {
        ...match,
        p1Name,
        p2Name,
      },
      originalValues: oldestLog?.oldValues || null,
      modifier: oldestLog ? {
        fullName: oldestLog.user?.fullName,
        email: oldestLog.user?.email,
        updatedAt: oldestLog.createdAt,
      } : null,
    };
  }

  async revertMatch(disputeId: string, adminId: string, resolutionNote: string) {
    // 1. Fetch the dispute
    const [dispute] = await this.db
      .select()
      .from(schema.matchDisputes)
      .where(eq(schema.matchDisputes.id, disputeId))
      .limit(1);

    if (!dispute) {
      throw new NotFoundException('Không tìm thấy đơn tranh chấp.');
    }

    if (dispute.status !== 'OPEN') {
      throw new BadRequestException('Đơn tranh chấp này đã được xử lý.');
    }

    const [match] = await this.db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, dispute.matchId))
      .limit(1);

    if (!match) {
      throw new NotFoundException('Không tìm thấy trận đấu tương ứng.');
    }

    // 2. Fetch the oldest update audit log for this match to get the original values
    const [oldestLog] = await this.db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.tableName, 'matches'),
          eq(schema.auditLogs.recordId, match.id)
        )
      )
      .orderBy(asc(schema.auditLogs.createdAt))
      .limit(1);

    if (!oldestLog || !oldestLog.oldValues) {
      throw new BadRequestException('Không tìm thấy lịch sử thay đổi để khôi phục tỉ số gốc.');
    }

    const original = oldestLog.oldValues as OriginalMatchValues;

    return await this.db.transaction(async (tx) => {
      // 3. Update the match in database back to original values
      const [updatedMatch] = await tx
        .update(schema.matches)
        .set({
          scoreDetails: original.scoreDetails,
          p1SetsWon: original.p1SetsWon,
          p2SetsWon: original.p2SetsWon,
          winnerId: original.winnerId,
          status: original.status || 'COMPLETED',
          completedAt: original.completedAt ? new Date(original.completedAt) : match.completedAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.matches.id, match.id))
        .returning();

      // 4. Update dispute status to RESOLVED
      const [updatedDispute] = await tx
        .update(schema.matchDisputes)
        .set({
          status: 'RESOLVED',
          resolvedBy: adminId,
          resolutionNote,
          resolvedAt: new Date(),
        })
        .where(eq(schema.matchDisputes.id, dispute.id))
        .returning();

      // 5. Get tournament info to get categoryId and matchType
      const [tournament] = await tx
        .select({
          categoryId: schema.tournaments.categoryId,
          matchType: schema.tournaments.matchType,
        })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, match.tournamentId))
        .limit(1);

      if (!tournament) {
        throw new NotFoundException('Không tìm thấy thông tin giải đấu cho trận đấu này.');
      }

      // 6. Identify players involved
      const participantIds: string[] = [];
      if (match.participant1Id) participantIds.push(match.participant1Id);
      if (match.participant2Id) participantIds.push(match.participant2Id);

      const players: { userId: string }[] = participantIds.length > 0
        ? await tx
            .select({ userId: schema.tournamentRosters.userId })
            .from(schema.tournamentRosters)
            .where(inArray(schema.tournamentRosters.participantId, participantIds))
        : [];

      const playerIds = players.map(p => p.userId);
      const fromTime = match.completedAt || match.updatedAt;

      // 7. Recalculate ELO chain
      if (playerIds.length > 0) {
        await this.rankingsService.recalculateEloChain(
          tx,
          playerIds,
          fromTime,
          tournament.categoryId,
          tournament.matchType,
        );
      }

      await tx.insert(schema.auditLogs).values({
        userId: adminId,
        action: 'MATCH_DISPUTE_REVERT',
        tableName: 'match_disputes',
        recordId: dispute.id,
        oldValues: {
          match: {
            scoreDetails: match.scoreDetails,
            p1SetsWon: match.p1SetsWon,
            p2SetsWon: match.p2SetsWon,
            winnerId: match.winnerId,
            status: match.status,
          },
          dispute: {
            status: dispute.status,
          }
        },
        newValues: {
          match: {
            scoreDetails: updatedMatch.scoreDetails,
            p1SetsWon: updatedMatch.p1SetsWon,
            p2SetsWon: updatedMatch.p2SetsWon,
            winnerId: updatedMatch.winnerId,
            status: updatedMatch.status,
          },
          dispute: {
            status: updatedDispute.status,
            resolutionNote: updatedDispute.resolutionNote,
          }
        },
      });

      return updatedDispute;
    });
  }

  async listReports(page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.reports);

    const reporterUser = aliasedTable(schema.users, 'reporter_user');
    const reporterProfile = aliasedTable(schema.profiles, 'reporter_profile');
    const targetUser = aliasedTable(schema.users, 'target_user');
    const targetUserProfile = aliasedTable(schema.profiles, 'target_user_profile');
    const targetTournament = aliasedTable(schema.tournaments, 'target_tournament');

    const data = await this.db
      .select({
        id: schema.reports.id,
        targetType: schema.reports.targetType,
        targetId: schema.reports.targetId,
        reason: schema.reports.reason,
        evidenceUrls: schema.reports.evidenceUrls,
        status: schema.reports.status,
        resolutionNote: schema.reports.resolutionNote,
        createdAt: schema.reports.createdAt,
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
        }
      })
      .from(schema.reports)
      .innerJoin(reporterUser, eq(schema.reports.reporterId, reporterUser.id))
      .leftJoin(reporterProfile, eq(reporterUser.id, reporterProfile.userId))
      .leftJoin(targetUser, and(eq(schema.reports.targetType, 'USER'), eq(schema.reports.targetId, targetUser.id)))
      .leftJoin(targetUserProfile, eq(targetUser.id, targetUserProfile.userId))
      .leftJoin(targetTournament, and(eq(schema.reports.targetType, 'TOURNAMENT'), eq(schema.reports.targetId, targetTournament.id)))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.reports.createdAt));

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

  async resolveReport(reportId: string, adminId: string, status: 'RESOLVED' | 'REJECTED', resolutionNote: string) {
    const [report] = await this.db
      .select()
      .from(schema.reports)
      .where(eq(schema.reports.id, reportId))
      .limit(1);

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const [updatedReport] = await this.db
      .update(schema.reports)
      .set({
        status,
        resolutionNote,
        resolvedBy: adminId,
        resolvedAt: new Date(),
      })
      .where(eq(schema.reports.id, reportId))
      .returning();

    return updatedReport;
  }

  async suspendTournament(tournamentId: string, _adminId: string) {
    const [tournament] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const [updatedTournament] = await this.db
      .update(schema.tournaments)
      .set({
        status: 'SUSPENDED',
        updatedAt: new Date(),
      })
      .where(eq(schema.tournaments.id, tournamentId))
      .returning();

    await this.notificationsService.sendNotification(
      buildTournamentSuspendedNotification({
        receiverId: tournament.createdBy,
        tournamentId,
        tournamentName: tournament.name,
      }),
    );

    return updatedTournament;
  }

  async unsuspendTournament(tournamentId: string, _adminId: string) {
    const [tournament] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const [updatedTournament] = await this.db
      .update(schema.tournaments)
      .set({
        status: 'ONGOING',
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

    return updatedTournament;
  }

  async approveTournament(tournamentId: string, _adminId: string) {
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
        status: 'REGISTRATION_OPEN',
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

    return updatedTournament;
  }

  async rejectTournament(tournamentId: string, _adminId: string) {
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
      }),
    );

    return updatedTournament;
  }

  async banTournament(tournamentId: string, _adminId: string) {
    const [tournament] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);

    if (!tournament) {
      throw new NotFoundException('Tournament not found');
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
      buildTournamentCancelledNotification({
        receiverId: tournament.createdBy,
        tournamentId,
        tournamentName: tournament.name,
      }),
    );

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

    return deletedTournament;
  }

  async rejectDeleteTournament(tournamentId: string, adminId: string) {
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

    const [updatedTournament] = await this.db
      .update(schema.tournaments)
      .set({
        status: 'REGISTRATION_OPEN',
        updatedAt: new Date(),
      })
      .where(eq(schema.tournaments.id, tournamentId))
      .returning();

    await this.notificationsService.sendNotification(
      buildTournamentDeleteRejectedNotification({
        receiverId: tournament.createdBy,
        tournamentId,
        tournamentName: tournament.name,
      }),
    );

    if (tournament.parentId) {
      await this.db
        .update(schema.tournaments)
        .set({
          status: 'REGISTRATION_OPEN',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.tournaments.parentId, tournament.parentId),
            eq(schema.tournaments.status, 'PENDING_DELETE'),
            isNull(schema.tournaments.deletedAt),
          ),
        );
    }

    return updatedTournament;
  }

  async listTournaments(page = 1, limit = 10, search?: string, status?: string) {
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

    const whereClause = and(...conditions);

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.tournaments)
      .where(whereClause);

    const data = await this.db
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
      .limit(limit)
      .offset(offset)
      .orderBy(desc(schema.tournaments.createdAt));

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

  async getUserVerificationTickets(userId: string) {
    return this.db
      .select()
      .from(schema.verificationTickets)
      .where(eq(schema.verificationTickets.userId, userId))
      .orderBy(desc(schema.verificationTickets.createdAt));
  }
}



