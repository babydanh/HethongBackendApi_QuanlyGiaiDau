import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PayoutRequestDto } from './dto/payout-request.dto';

@Injectable()
export class PaymentsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async createPayment(userId: string, data: CreatePaymentDto) {
    const [record] = await this.db
      .insert(schema.payments)
      .values({
        userId,
        tournamentId: data.tournamentId,
        participantId: data.participantId,
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
      }

      return updated;
    });
  }

  async createPayoutRequest(
    organizerId: string,
    data: PayoutRequestDto,
    totalCollected: number,
    platformFeeRetained: number,
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
}
