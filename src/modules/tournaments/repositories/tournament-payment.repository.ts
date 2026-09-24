import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb, AppDbOrTx } from '../../../database/db.types';
import type { Transaction } from '../../audit/audit.service';
import * as schema from '../../../database/schema';
import { PaymentStatus } from '../../../common/constants/enums';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
} from 'drizzle-orm';

@Injectable()
export class TournamentPaymentRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}
  async assertEntryFeeChangeAllowed(
    tx: AppDbOrTx,
    tournament: {
      id: string;
      status: string;
      isRegistrationLocked: boolean | null;
    },
    currentEntryFee: string | number | null | undefined,
    nextEntryFee: number | null | undefined,
    currentOverrideEnabled?: boolean | null,
    nextOverrideEnabled?: boolean | null,
  ) {
    if (nextEntryFee === undefined && nextOverrideEnabled === undefined) {
      return;
    }

    const currentEnabled = currentOverrideEnabled ?? currentEntryFee != null;
    const nextEnabled = nextOverrideEnabled ?? nextEntryFee != null;
    const currentFee = currentEnabled ? Number(currentEntryFee ?? 0) : 0;
    const nextFee = nextEnabled ? Number(nextEntryFee ?? 0) : 0;
    if (currentEnabled === nextEnabled && currentFee === nextFee) return;

    const editableStatuses = new Set([
      'DRAFT',
      'PENDING_APPROVAL',
      'UPCOMING',
      'REGISTRATION_OPEN',
    ]);
    const lockedStatuses = new Set([
      'REGISTRATION_CLOSED',
      'IN_PROGRESS',
      'ONGOING',
      'COMPLETED',
      'CANCELLED',
      'PENDING_DELETE',
    ]);

    if (
      tournament.isRegistrationLocked ||
      lockedStatuses.has(tournament.status) ||
      !editableStatuses.has(tournament.status)
    ) {
      throw new BadRequestException(
        'Không thể thay đổi lệ phí khi giải đã khóa đăng ký, đang diễn ra hoặc đã kết thúc.',
      );
    }

    const [activeParticipantResult] = await tx
      .select({ value: count() })
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournament.id),
          notInArray(schema.tournamentParticipants.teamStatus, [
            'REJECTED',
            'WITHDRAWN',
            'KICKED',
            'EXPIRED',
            'CANCELLED',
          ]),
        ),
      );

    if (Number(activeParticipantResult?.value ?? 0) > 0) {
      throw new BadRequestException(
        'Không thể thay đổi lệ phí sau khi giải đã có người tham gia.',
      );
    }
  }
  async resolveDivisionEntryFee(
    tx: Transaction | AppDbOrTx,
    tournament: { id?: string; entryFee: string | null },
    divisionId?: string | null,
  ) {
    if (divisionId) {
      const [division] = await tx
        .select({
          entryFee: schema.tournamentDivisions.entryFee,
          entryFeeOverrideEnabled:
            schema.tournamentDivisions.entryFeeOverrideEnabled,
        })
        .from(schema.tournamentDivisions)
        .where(
          tournament.id
            ? and(
                eq(schema.tournamentDivisions.id, divisionId),
                eq(schema.tournamentDivisions.tournamentId, tournament.id),
              )
            : eq(schema.tournamentDivisions.id, divisionId),
        )
        .limit(1);

      if (
        division?.entryFeeOverrideEnabled === true &&
        division.entryFee !== undefined &&
        division.entryFee !== null
      ) {
        return parseFloat(division.entryFee);
      }
    }

    return parseFloat(tournament.entryFee || '0');
  }
  async invalidatePendingParticipantPayments(
    tx: Transaction | AppDbOrTx,
    tournamentId: string,
    participantId: string,
    reason: string,
  ) {
    const pendingPayments = await tx
      .select({
        id: schema.payments.id,
        status: schema.payments.status,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.payments.participantId, participantId),
          eq(schema.payments.status, PaymentStatus.PENDING),
        ),
      );

    if (pendingPayments.length === 0) {
      return;
    }

    const paymentIds = pendingPayments.map((payment) => payment.id);
    await tx
      .update(schema.payments)
      .set({
        status: 'CANCELLED',
        updatedAt: new Date(),
      })
      .where(inArray(schema.payments.id, paymentIds));

    await tx.insert(schema.paymentStatusLogs).values(
      pendingPayments.map((payment) => ({
        paymentId: payment.id,
        previousStatus: payment.status,
        newStatus: 'CANCELLED',
        reason,
      })),
    );
  }
  async findCompletedParticipantPaymentInTx(
    tx: Transaction | AppDbOrTx,
    tournamentId: string,
    participantId: string,
  ) {
    const [payment] = await tx
      .select({
        id: schema.payments.id,
        userId: schema.payments.userId,
        amount: schema.payments.amount,
        platformFeeAmount: schema.payments.platformFeeAmount,
        refundedAmount: schema.payments.refundedAmount,
        refundStatus: schema.payments.refundStatus,
        refundableAmount: sql<string>`GREATEST(${schema.payments.amount} - COALESCE(${schema.payments.refundedAmount}, 0), 0)`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.payments.participantId, participantId),
          eq(schema.payments.status, PaymentStatus.COMPLETED),
          eq(schema.payments.purpose, 'REGISTRATION_FEE'),
        ),
      )
      .orderBy(desc(schema.payments.paidAt), desc(schema.payments.createdAt))
      .limit(1);
    return payment ?? null;
  }
  async createPendingRefund(
    tx: Transaction | AppDbOrTx,
    input: {
      paymentId: string;
      amount: string;
      reason: string;
      requestedBy: string | null;
      bankName?: string | null;
      bankAccountNumber?: string | null;
      bankAccountName?: string | null;
    },
  ) {
    const [updatedPayment] = await tx
      .update(schema.payments)
      .set({
        refundStatus: 'PENDING_REFUND',
        refundBankName: input.bankName,
        refundAccountNumber: input.bankAccountNumber,
        refundAccountName: input.bankAccountName,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.payments.id, input.paymentId),
          eq(schema.payments.status, PaymentStatus.COMPLETED),
          isNull(schema.payments.refundStatus),
        ),
      )
      .returning({ id: schema.payments.id });
    if (!updatedPayment) {
      throw new ConflictException('Payment already has a refund state.');
    }

    const [refund] = await tx
      .insert(schema.paymentRefunds)
      .values({
        paymentId: input.paymentId,
        amount: input.amount,
        reason: input.reason,
        requestedBy: input.requestedBy,
        bankName: input.bankName,
        bankAccountNumber: input.bankAccountNumber,
        bankAccountName: input.bankAccountName,
        status: 'REQUESTED',
      })
      .returning();
    return refund;
  }
  async countPaidPayments(tournamentId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.payments.status, 'COMPLETED'),
        ),
      );
    return result?.count || 0;
  }
  async sumCompletedRegistrationPlatformFees(
    tournamentId: string,
  ): Promise<number> {
    const [result] = await this.db
      .select({
        total: sql<string>`coalesce(sum(${schema.payments.platformFeeAmount}), '0')`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.payments.purpose, 'REGISTRATION_FEE'),
          eq(schema.payments.status, 'COMPLETED'),
        ),
      );
    const total = Number(result?.total ?? 0);
    return Number.isFinite(total) && total >= 0 ? total : 0;
  }
  async countPendingRefunds(tournamentId: string): Promise<number> {
    const [result] = await this.db
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
    return result?.count || 0;
  }
  async isFullyRefunded(tournamentId: string): Promise<boolean> {
    // Check if all COMPLETED payments have refundStatus = 'REFUNDED'
    const [result] = await this.db
      .select({ count: count() })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.tournamentId, tournamentId),
          eq(schema.payments.status, 'COMPLETED'),
          sql`${schema.payments.refundStatus} IS DISTINCT FROM 'REFUNDED'`,
        ),
      );
    // If there are no non-refunded COMPLETED payments → fully refunded
    return (result?.count || 0) === 0;
  }
  async findCompletedParticipantPayment(participantId: string) {
    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.participantId, participantId),
          eq(schema.payments.status, PaymentStatus.COMPLETED),
        ),
      )
      .orderBy(desc(schema.payments.paidAt), desc(schema.payments.createdAt))
      .limit(1);
    return payment;
  }
  async markParticipantPaid(participantId: string) {
    const [updated] = await this.db
      .update(schema.tournamentParticipants)
      .set({ isPaid: true })
      .where(eq(schema.tournamentParticipants.id, participantId))
      .returning({ id: schema.tournamentParticipants.id });
    return updated ?? null;
  }
}
