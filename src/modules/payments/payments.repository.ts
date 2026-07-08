import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { PaymentPurpose } from './dto/create-payment.dto';
import { PayoutRequestDto } from './dto/payout-request.dto';
import type { PayoutReviewStatus } from './dto/review-payout.dto';

export interface CreatePaymentIntentInput {
  tournamentId: string;
  participantId?: string;
  divisionId?: string;
  purpose: PaymentPurpose;
  amount: number;
  platformFeeAmount: number;
  idempotencyKey: string;
  expiresAt: Date;
}

const activePayoutStatuses = [
  'PENDING',
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PROCESSING',
  'HELD_IN_ESCROW',
  'PENDING_DISBURSEMENT',
];

@Injectable()
export class PaymentsRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  async getConfigValue(key: string, defaultValue: string): Promise<string> {
    const [existing] = await this.db
      .select({ value: schema.systemConfigs.value })
      .from(schema.systemConfigs)
      .where(eq(schema.systemConfigs.key, key))
      .limit(1);
    return existing?.value ?? defaultValue;
  }

  async findTournamentById(id: string) {
    const [record] = await this.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, id))
      .limit(1);
    return record ?? null;
  }

  async findParticipantById(id: string) {
    const [record] = await this.db
      .select()
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.id, id))
      .limit(1);
    return record ?? null;
  }

  async findDivisionById(id: string) {
    const [record] = await this.db
      .select()
      .from(schema.tournamentDivisions)
      .where(eq(schema.tournamentDivisions.id, id))
      .limit(1);
    return record ?? null;
  }

  async countTournamentPlayers(tournamentId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(${schema.tournamentRosters.id})::int` })
      .from(schema.tournamentParticipants)
      .innerJoin(
        schema.tournamentRosters,
        eq(schema.tournamentRosters.participantId, schema.tournamentParticipants.id),
      )
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
          eq(schema.tournamentParticipants.isPaid, true),
        ),
      );
    return result?.count ?? 0;
  }

  async countParticipantPlayers(participantId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.tournamentRosters)
      .where(eq(schema.tournamentRosters.participantId, participantId));
    return result?.count ?? 0;
  }

  async findReusablePayment(
    userId: string,
    purpose: PaymentPurpose,
    tournamentId: string,
    participantId?: string,
  ) {
    const conditions = [
      eq(schema.payments.userId, userId),
      eq(schema.payments.purpose, purpose),
      eq(schema.payments.tournamentId, tournamentId),
      eq(schema.payments.status, 'PENDING'),
      sql`${schema.payments.expiresAt} > now()`,
      participantId
        ? eq(schema.payments.participantId, participantId)
        : sql`${schema.payments.participantId} IS NULL`,
    ];
    const [record] = await this.db
      .select()
      .from(schema.payments)
      .where(and(...conditions))
      .orderBy(desc(schema.payments.createdAt))
      .limit(1);
    return record ?? null;
  }

  async findPaymentById(id: string) {
    const [record] = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, id))
      .limit(1);
    return record ?? null;
  }

  async findPaymentByReference(reference: string) {
    const [record] = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.providerOrderCode, reference))
      .limit(1);
    return record ?? null;
  }

  async createPaymentIntent(userId: string, input: CreatePaymentIntentInput) {
    const [record] = await this.db
      .insert(schema.payments)
      .values({
        userId,
        tournamentId: input.tournamentId,
        participantId: input.participantId,
        divisionId: input.divisionId,
        purpose: input.purpose,
        amount: input.amount.toString(),
        platformFeeAmount: input.platformFeeAmount.toString(),
        status: 'PENDING',
        paymentGateway: 'PAYOS',
        idempotencyKey: input.idempotencyKey,
        expiresAt: input.expiresAt,
      })
      .returning();
    return record;
  }

  async attachPayOSLink(paymentId: string, orderCode: string) {
    const [record] = await this.db
      .update(schema.payments)
      .set({
        providerOrderCode: orderCode,
        transactionReference: orderCode,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.status, 'PENDING')))
      .returning();
    return record ?? null;
  }

  async transitionPayment(
    paymentId: string,
    expectedStatus: string,
    newStatus: string,
    reason: string,
    gatewayResponse?: Record<string, unknown>,
    providerTransactionId?: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.payments)
        .set({
          status: newStatus,
          gatewayResponse,
          providerTransactionId,
          paidAt: newStatus === 'COMPLETED' ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.payments.id, paymentId),
            eq(schema.payments.status, expectedStatus),
          ),
        )
        .returning();

      if (!updated) {
        const [current] = await tx
          .select()
          .from(schema.payments)
          .where(eq(schema.payments.id, paymentId))
          .limit(1);
        return { payment: current ?? null, transitioned: false };
      }

      await tx.insert(schema.paymentStatusLogs).values({
        paymentId,
        previousStatus: expectedStatus,
        newStatus,
        reason,
      });

      if (newStatus === 'COMPLETED') {
        if (updated.participantId) {
          await tx
            .update(schema.tournamentParticipants)
            .set({ isPaid: true })
            .where(eq(schema.tournamentParticipants.id, updated.participantId));
        }

        await tx.insert(schema.financialLedgerEntries).values({
          tournamentId: updated.tournamentId,
          paymentId: updated.id,
          entryType: 'PAYMENT_CAPTURED',
          direction: 'CREDIT',
          amount: updated.amount,
          idempotencyKey: `payment:${updated.id}:captured`,
        });

        const retainedAmount =
          updated.purpose === PaymentPurpose.REGISTRATION_FEE
            ? Number(updated.platformFeeAmount ?? 0)
            : Number(updated.amount);
        if (retainedAmount > 0) {
          await tx.insert(schema.financialLedgerEntries).values({
            tournamentId: updated.tournamentId,
            paymentId: updated.id,
            entryType: 'PLATFORM_FEE_RETAINED',
            direction: 'DEBIT',
            amount: retainedAmount.toString(),
            idempotencyKey: `payment:${updated.id}:platform-fee`,
          });
        }
      }

      return { payment: updated, transitioned: true };
    });
  }

  async setTournamentStatus(tournamentId: string, status: string) {
    return this.db
      .update(schema.tournaments)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.tournaments.id, tournamentId));
  }

  async findUserPayments(userId: string) {
    return this.db
      .select({
        payment: schema.payments,
        tournament: { id: schema.tournaments.id, name: schema.tournaments.name },
      })
      .from(schema.payments)
      .innerJoin(schema.tournaments, eq(schema.payments.tournamentId, schema.tournaments.id))
      .where(eq(schema.payments.userId, userId))
      .orderBy(desc(schema.payments.createdAt));
  }

  async findPayoutById(id: string) {
    const [record] = await this.db
      .select()
      .from(schema.organizerPayouts)
      .where(eq(schema.organizerPayouts.id, id))
      .limit(1);
    return record ?? null;
  }

  async createPayoutRequest(
    organizerId: string,
    data: PayoutRequestDto,
  ) {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`payout:${data.tournamentId}`}))`,
      );

      const [activePayout] = await tx
        .select({ id: schema.organizerPayouts.id })
        .from(schema.organizerPayouts)
        .where(
          and(
            eq(schema.organizerPayouts.tournamentId, data.tournamentId),
            inArray(schema.organizerPayouts.status, activePayoutStatuses),
          ),
        )
        .limit(1);
      if (activePayout) throw new Error('Giải đấu đang có một yêu cầu giải ngân chưa kết thúc.');

      const [openRefund] = await tx
        .select({ id: schema.paymentRefunds.id })
        .from(schema.paymentRefunds)
        .innerJoin(schema.payments, eq(schema.paymentRefunds.paymentId, schema.payments.id))
        .where(
          and(
            eq(schema.payments.tournamentId, data.tournamentId),
            inArray(schema.paymentRefunds.status, [
              'REQUESTED',
              'UNDER_REVIEW',
              'PROCESSING',
            ]),
          ),
        )
        .limit(1);
      if (openRefund) throw new Error('Giải đấu còn yêu cầu hoàn tiền đang xử lý.');

      const [balance] = await tx
        .select({
          available: sql<string>`coalesce(sum(case when ${schema.financialLedgerEntries.direction} = 'CREDIT' then ${schema.financialLedgerEntries.amount} else -${schema.financialLedgerEntries.amount} end), 0)`,
          collected: sql<string>`coalesce(sum(case when ${schema.financialLedgerEntries.entryType} = 'PAYMENT_CAPTURED' then ${schema.financialLedgerEntries.amount} else 0 end), 0)`,
          retained: sql<string>`coalesce(sum(case when ${schema.financialLedgerEntries.entryType} = 'PLATFORM_FEE_RETAINED' then ${schema.financialLedgerEntries.amount} else 0 end), 0)`,
        })
        .from(schema.financialLedgerEntries)
        .where(eq(schema.financialLedgerEntries.tournamentId, data.tournamentId));

      const available = Number(balance?.available ?? 0);
      if (data.amountRequested > available) {
        throw new Error('Số tiền yêu cầu vượt quá số dư khả dụng.');
      }

      const [record] = await tx
        .insert(schema.organizerPayouts)
        .values({
          organizerId,
          tournamentId: data.tournamentId,
          totalCollected: balance?.collected ?? '0',
          amountRequested: data.amountRequested.toString(),
          platformFeeRetained: balance?.retained ?? '0',
          bankName: data.bankName,
          bankAccountName: data.bankAccountName,
          bankAccountNumber: data.bankAccountNumber,
          status: 'REQUESTED',
        })
        .returning();

      await tx.insert(schema.payoutStatusLogs).values({
        payoutId: record.id,
        previousStatus: 'NONE',
        newStatus: 'REQUESTED',
        changedBy: organizerId,
        note: 'USER_REQUEST',
      });
      await tx.insert(schema.financialLedgerEntries).values({
        tournamentId: data.tournamentId,
        payoutId: record.id,
        entryType: 'PAYOUT_RESERVED',
        direction: 'DEBIT',
        amount: data.amountRequested.toString(),
        idempotencyKey: `payout:${record.id}:reserved`,
        createdBy: organizerId,
      });
      return record;
    });
  }

  async transitionPayout(
    id: string,
    expectedStatuses: string[],
    status: PayoutReviewStatus,
    adminId: string,
    data?: { transactionProofUrl?: string; note?: string },
  ) {
    return this.db.transaction(async (tx) => {
      const [oldPayout] = await tx
        .select()
        .from(schema.organizerPayouts)
        .where(eq(schema.organizerPayouts.id, id))
        .limit(1);
      if (!oldPayout) return null;

      const [updated] = await tx
        .update(schema.organizerPayouts)
        .set({
          status,
          processedBy: adminId,
          processedAt: new Date(),
          updatedAt: new Date(),
          transactionProofUrl: data?.transactionProofUrl,
          disbursedAt: status === 'PAID' ? new Date() : undefined,
        })
        .where(
          and(
            eq(schema.organizerPayouts.id, id),
            inArray(schema.organizerPayouts.status, expectedStatuses),
          ),
        )
        .returning();
      if (!updated) return null;

      await tx.insert(schema.payoutStatusLogs).values({
        payoutId: id,
        previousStatus: oldPayout.status,
        newStatus: status,
        changedBy: adminId,
        note: data?.note ?? `${status}_BY_ADMIN`,
      });

      if (status === 'REJECTED') {
        await tx.insert(schema.financialLedgerEntries).values({
          tournamentId: updated.tournamentId,
          payoutId: updated.id,
          entryType: 'PAYOUT_RELEASED',
          direction: 'CREDIT',
          amount: updated.amountRequested,
          idempotencyKey: `payout:${updated.id}:released`,
          createdBy: adminId,
        });
      }
      return updated;
    });
  }

  async findOrganizerPayouts(organizerId: string) {
    return this.db
      .select({
        payout: schema.organizerPayouts,
        tournament: { id: schema.tournaments.id, name: schema.tournaments.name },
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
        tournament: { id: schema.tournaments.id, name: schema.tournaments.name },
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

  async findAllPayments() {
    return this.db
      .select({
        payment: schema.payments,
        tournament: { id: schema.tournaments.id, name: schema.tournaments.name },
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
    const [users] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
    const [communities] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.communities);
    const [tournaments] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.tournaments);
    const [paymentTotals] = await this.db
      .select({
        amount: sql<string>`coalesce(sum(${schema.payments.amount}), 0)`,
        fee: sql<string>`coalesce(sum(${schema.payments.platformFeeAmount}), 0)`,
      })
      .from(schema.payments)
      .where(eq(schema.payments.status, 'COMPLETED'));
    const [payoutTotals] = await this.db
      .select({ amount: sql<string>`coalesce(sum(${schema.organizerPayouts.amountRequested}), 0)` })
      .from(schema.organizerPayouts)
      .where(eq(schema.organizerPayouts.status, 'PAID'));
    return {
      totalUsers: users?.count ?? 0,
      totalCommunities: communities?.count ?? 0,
      totalTournaments: tournaments?.count ?? 0,
      totalAmountProcessed: paymentTotals?.amount ?? '0.00',
      totalPlatformFee: paymentTotals?.fee ?? '0.00',
      totalPayoutProcessed: payoutTotals?.amount ?? '0.00',
    };
  }

  async confirmLegacyRefund(paymentId: string, adminId: string, proofUrl: string) {
    return this.db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.id, paymentId))
        .limit(1);
      if (!payment || payment.status !== 'COMPLETED' || payment.refundStatus !== 'PENDING_REFUND') {
        return null;
      }

      const [updated] = await tx
        .update(schema.payments)
        .set({ refundStatus: 'REFUNDED', refundedAmount: payment.amount, updatedAt: new Date() })
        .where(
          and(
            eq(schema.payments.id, paymentId),
            eq(schema.payments.refundStatus, 'PENDING_REFUND'),
          ),
        )
        .returning();
      if (!updated) return null;

      const [refund] = await tx
        .insert(schema.paymentRefunds)
        .values({
          paymentId,
          amount: payment.amount,
          status: 'PAID',
          reason: 'LEGACY_WITHDRAWAL_REFUND',
          transactionProofUrl: proofUrl,
          processedBy: adminId,
          processedAt: new Date(),
        })
        .returning();
      await tx.insert(schema.financialLedgerEntries).values({
        tournamentId: payment.tournamentId,
        paymentId,
        refundId: refund.id,
        entryType: 'REFUND_PAID',
        direction: 'DEBIT',
        amount: payment.amount,
        idempotencyKey: `refund:${refund.id}:paid`,
        createdBy: adminId,
      });
      await tx.insert(schema.paymentStatusLogs).values({
        paymentId,
        previousStatus: payment.status,
        newStatus: 'REFUNDED',
        changedBy: adminId,
        reason: 'ADMIN_CONFIRM_REFUND',
      });
      return updated;
    });
  }
}
