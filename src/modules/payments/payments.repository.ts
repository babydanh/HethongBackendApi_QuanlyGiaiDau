import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, desc, sql, and, isNotNull } from 'drizzle-orm';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PayoutRequestDto } from './dto/payout-request.dto';

@Injectable()
export class PaymentsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async getConfigValue(key: string, defaultValue: string): Promise<string> {
    const [existing] = await this.db
      .select()
      .from(schema.systemConfigs)
      .where(eq(schema.systemConfigs.key, key))
      .limit(1);
    return existing ? existing.value : defaultValue;
  }

  async createPayment(userId: string, data: CreatePaymentDto) {
    const [record] = await this.db
      .insert(schema.payments)
      .values({
        userId,
        tournamentId: data.tournamentId,
        participantId: data.participantId,
        divisionId: data.divisionId,
        amount: data.amount.toString(),
        status: 'PENDING',
        paymentGateway: data.paymentGateway || 'VNPAY',
      })
      .returning();
    return record;
  }

  async findPaymentById(id: string) {
    const [record] = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, id))
      .limit(1);
    return record || null;
  }

  async findTournamentById(id: string) {
    const [record] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, id))
      .limit(1);
    return record || null;
  }

  async setTournamentStatus(tournamentId: string, status: string) {
    return this.db
      .update(schema.tournaments)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.tournaments.id, tournamentId));
  }

  async updatePaymentStatus(
    id: string,
    status: string,
    gatewayResponse?: Record<string, unknown>,
    reason?: string,
  ) {
    return await this.db.transaction(async (tx) => {
      const [oldPayment] = await tx
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, id))
        .limit(1);

      const [updated] = await tx
        .update(schema.payments)
        .set({
          status,
          ...(gatewayResponse && { gatewayResponse }),
          ...(status === 'COMPLETED' && { paidAt: new Date() }),
        })
        .where(eq(schema.payments.id, id))
        .returning();

      if (oldPayment) {
        await tx.insert(schema.paymentStatusLogs).values({
          paymentId: id,
          previousStatus: oldPayment.status,
          newStatus: status,
          reason: reason || 'SYSTEM_UPDATE',
        });

        if (status === 'COMPLETED' && oldPayment.participantId) {
          await tx
            .update(schema.tournamentParticipants)
            .set({ isPaid: true })
            .where(eq(schema.tournamentParticipants.id, oldPayment.participantId));
        }
      }

      return updated;
    });
  }

  async createPayoutRequest(
    organizerId: string,
    data: PayoutRequestDto,
    totalCollected: number,
    platformFeeRetained: number,
    holdUntil: Date | null,
  ) {
    return await this.db.transaction(async (tx) => {
      const [record] = await tx
        .insert(schema.organizerPayouts)
        .values({
          organizerId,
          tournamentId: data.tournamentId,
          totalCollected: totalCollected.toString(),
          amountRequested: data.amountRequested.toString(),
          platformFeeRetained: platformFeeRetained.toString(),
          bankName: data.bankName,
          bankAccountName: data.bankAccountName,
          bankAccountNumber: data.bankAccountNumber,
          status: 'PENDING',
          holdUntil: holdUntil,
        })
        .returning();

      await tx.insert(schema.payoutStatusLogs).values({
        payoutId: record.id,
        previousStatus: 'NONE',
        newStatus: 'PENDING',
        changedBy: organizerId,
        note: 'USER_REQUEST',
      });

      return record;
    });
  }

  async findUserPayments(userId: string) {
    return this.db
      .select({
        payment: schema.payments,
        tournament: {
          id: schema.tournaments.id,
          name: schema.tournaments.name,
        },
      })
      .from(schema.payments)
      .innerJoin(schema.tournaments, eq(schema.payments.tournamentId, schema.tournaments.id))
      .where(eq(schema.payments.userId, userId))
      .orderBy(desc(schema.payments.createdAt));
  }

  async findOrganizerPayouts(organizerId: string) {
    return this.db
      .select({
        payout: schema.organizerPayouts,
        tournament: {
          id: schema.tournaments.id,
          name: schema.tournaments.name,
        },
      })
      .from(schema.organizerPayouts)
      .innerJoin(schema.tournaments, eq(schema.organizerPayouts.tournamentId, schema.tournaments.id))
      .where(eq(schema.organizerPayouts.organizerId, organizerId))
      .orderBy(desc(schema.organizerPayouts.createdAt));
  }

  async findAllPayoutRequests() {
    return this.db
      .select({
        payout: schema.organizerPayouts,
        tournament: {
          id: schema.tournaments.id,
          name: schema.tournaments.name,
        },
        organizer: {
          id: schema.users.id,
          email: schema.users.email,
          fullName: schema.profiles.fullName,
        },
      })
      .from(schema.organizerPayouts)
      .innerJoin(schema.tournaments, eq(schema.organizerPayouts.tournamentId, schema.tournaments.id))
      .innerJoin(schema.users, eq(schema.organizerPayouts.organizerId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .orderBy(desc(schema.organizerPayouts.createdAt));
  }

  async updatePayoutStatus(
    id: string,
    status: 'APPROVED' | 'REJECTED',
    adminId: string,
    data?: { transactionProofUrl?: string; note?: string },
  ) {
    return await this.db.transaction(async (tx) => {
      const [oldPayout] = await tx
        .select()
        .from(schema.organizerPayouts)
        .where(eq(schema.organizerPayouts.id, id))
        .limit(1);

      if (!oldPayout) {
        throw new Error('Payout request not found');
      }

      const [updated] = await tx
        .update(schema.organizerPayouts)
        .set({
          status,
          processedBy: adminId,
          processedAt: new Date(),
          updatedAt: new Date(),
          ...(data?.transactionProofUrl && { transactionProofUrl: data.transactionProofUrl }),
        })
        .where(eq(schema.organizerPayouts.id, id))
        .returning();

      await tx.insert(schema.payoutStatusLogs).values({
        payoutId: id,
        previousStatus: oldPayout.status,
        newStatus: status,
        changedBy: adminId,
        note: data?.note || (status === 'APPROVED' ? 'APPROVED_BY_ADMIN' : 'REJECTED_BY_ADMIN'),
      });

      return updated;
    });
  }

  async findAllPayments() {
    return this.db
      .select({
        payment: schema.payments,
        tournament: {
          id: schema.tournaments.id,
          name: schema.tournaments.name,
        },
        user: {
          id: schema.users.id,
          email: schema.users.email,
          fullName: schema.profiles.fullName,
        },
      })
      .from(schema.payments)
      .innerJoin(schema.tournaments, eq(schema.payments.tournamentId, schema.tournaments.id))
      .innerJoin(schema.users, eq(schema.payments.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .orderBy(desc(schema.payments.createdAt));
  }

  async getAdminStats() {
    // 1. Get total users count
    const [usersCountResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users);
    
    // 2. Get total communities count
    const [communitiesCountResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.communities);

    // 3. Get total tournaments count
    const [tournamentsCountResult] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.tournaments);

    // 4. Get total amount processed (successful payments)
    const [totalPaymentsResult] = await this.db
      .select({
        totalAmount: sql<string>`coalesce(sum(${schema.payments.amount}), '0')`,
        totalPlatformFee: sql<string>`coalesce(sum(${schema.payments.platformFeeAmount}), '0')`
      })
      .from(schema.payments)
      .where(eq(schema.payments.status, 'COMPLETED'));

    // 5. Get total payout processed (approved payouts)
    const [totalPayoutResult] = await this.db
      .select({
        totalPayout: sql<string>`coalesce(sum(${schema.organizerPayouts.amountRequested}), '0')`
      })
      .from(schema.organizerPayouts)
      .where(eq(schema.organizerPayouts.status, 'APPROVED'));

    return {
      totalUsers: usersCountResult?.count || 0,
      totalCommunities: communitiesCountResult?.count || 0,
      totalTournaments: tournamentsCountResult?.count || 0,
      totalAmountProcessed: totalPaymentsResult?.totalAmount || '0.00',
      totalPlatformFee: totalPaymentsResult?.totalPlatformFee || '0.00',
      totalPayoutProcessed: totalPayoutResult?.totalPayout || '0.00',
    };
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const userRolesList = await this.db
      .select({
        slug: schema.roles.slug,
      })
      .from(schema.userToRoles)
      .innerJoin(schema.roles, eq(schema.userToRoles.roleId, schema.roles.id))
      .where(eq(schema.userToRoles.userId, userId));
    return userRolesList.map((r) => r.slug);
  }

  async getTotalCollected(tournamentId: string): Promise<number> {
    const [result] = await this.db
      .select({
        sum: sql<string>`coalesce(sum(${schema.payments.amount}), '0')`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.payments.status, 'COMPLETED'),
          isNotNull(schema.payments.participantId),
        ),
      );
    return parseFloat(result?.sum || '0');
  }
}


