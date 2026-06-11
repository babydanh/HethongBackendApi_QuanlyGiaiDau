import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq, and, desc, sql, or, ilike, count, SQL } from 'drizzle-orm';

@Injectable()
export class AdminService {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getMetrics() {
    // 1. GMV and platform fee from completed payments
    const [paymentsSum] = await this.db
      .select({
        gmv: sql<string>`coalesce(sum(${schema.payments.amount}), '0')`,
        netRevenue: sql<string>`coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
        transactionsCount: sql<number>`count(*)::int`,
      })
      .from(schema.payments)
      .where(eq(schema.payments.status, 'COMPLETED'));

    // 2. Held escrow funds from payouts
    const [escrowSum] = await this.db
      .select({
        heldEscrow: sql<string>`coalesce(sum(${schema.organizerPayouts.amountRequested}), '0')`,
      })
      .from(schema.organizerPayouts)
      .where(eq(schema.organizerPayouts.status, 'HELD_IN_ESCROW'));

    return {
      gmv: parseFloat(paymentsSum.gmv),
      netRevenue: parseFloat(paymentsSum.netRevenue),
      heldEscrow: parseFloat(escrowSum.heldEscrow),
      transactionsCount: paymentsSum.transactionsCount,
    };
  }

  async getRevenueChart(groupBy: 'week' | 'month' | 'year' = 'month') {
    const truncateUnit = groupBy === 'week' ? 'week' : groupBy === 'year' ? 'year' : 'month';

    const results = await this.db
      .select({
        period: sql<string>`date_trunc(${truncateUnit}, ${schema.payments.paidAt})`,
        gmv: sql<string>`coalesce(sum(${schema.payments.amount}), '0')`,
        revenue: sql<string>`coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.payments)
      .where(eq(schema.payments.status, 'COMPLETED'))
      .groupBy(sql`date_trunc(${truncateUnit}, ${schema.payments.paidAt})`)
      .orderBy(sql`date_trunc(${truncateUnit}, ${schema.payments.paidAt})`);

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
}
