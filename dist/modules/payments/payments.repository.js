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
exports.PaymentsRepository = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const create_payment_dto_1 = require("./dto/create-payment.dto");
const activePayoutStatuses = [
    'PENDING',
    'REQUESTED',
    'UNDER_REVIEW',
    'APPROVED',
    'PROCESSING',
    'HELD_IN_ESCROW',
    'PENDING_DISBURSEMENT',
];
let PaymentsRepository = class PaymentsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async getConfigValue(key, defaultValue) {
        const [existing] = await this.db
            .select({ value: schema.systemConfigs.value })
            .from(schema.systemConfigs)
            .where((0, drizzle_orm_1.eq)(schema.systemConfigs.key, key))
            .limit(1);
        return existing?.value ?? defaultValue;
    }
    async findTournamentById(id) {
        const [record] = await this.db
            .select()
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, id))
            .limit(1);
        return record ?? null;
    }
    async findParticipantById(id) {
        const [record] = await this.db
            .select()
            .from(schema.tournamentParticipants)
            .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, id))
            .limit(1);
        return record ?? null;
    }
    async findDivisionById(id) {
        const [record] = await this.db
            .select()
            .from(schema.tournamentDivisions)
            .where((0, drizzle_orm_1.eq)(schema.tournamentDivisions.id, id))
            .limit(1);
        return record ?? null;
    }
    async countTournamentPlayers(tournamentId) {
        const [result] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(${schema.tournamentRosters.id})::int` })
            .from(schema.tournamentParticipants)
            .innerJoin(schema.tournamentRosters, (0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, schema.tournamentParticipants.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentParticipants.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.teamStatus, 'COMPLETE'), (0, drizzle_orm_1.eq)(schema.tournamentParticipants.isPaid, true)));
        return result?.count ?? 0;
    }
    async countParticipantPlayers(participantId) {
        const [result] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.tournamentRosters)
            .where((0, drizzle_orm_1.eq)(schema.tournamentRosters.participantId, participantId));
        return result?.count ?? 0;
    }
    async findReusablePayment(userId, purpose, tournamentId, participantId) {
        const conditions = [
            (0, drizzle_orm_1.eq)(schema.payments.userId, userId),
            (0, drizzle_orm_1.eq)(schema.payments.purpose, purpose),
            (0, drizzle_orm_1.eq)(schema.payments.tournamentId, tournamentId),
            (0, drizzle_orm_1.eq)(schema.payments.status, 'PENDING'),
            (0, drizzle_orm_1.sql) `${schema.payments.expiresAt} > now()`,
            participantId
                ? (0, drizzle_orm_1.eq)(schema.payments.participantId, participantId)
                : (0, drizzle_orm_1.sql) `${schema.payments.participantId} IS NULL`,
        ];
        const [record] = await this.db
            .select()
            .from(schema.payments)
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy((0, drizzle_orm_1.desc)(schema.payments.createdAt))
            .limit(1);
        return record ?? null;
    }
    async findPaymentById(id) {
        const [record] = await this.db
            .select()
            .from(schema.payments)
            .where((0, drizzle_orm_1.eq)(schema.payments.id, id))
            .limit(1);
        return record ?? null;
    }
    async findPaymentByReference(reference) {
        const [record] = await this.db
            .select()
            .from(schema.payments)
            .where((0, drizzle_orm_1.eq)(schema.payments.providerOrderCode, reference))
            .limit(1);
        return record ?? null;
    }
    async createPaymentIntent(userId, input) {
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
        await this.db.insert(schema.paymentReceipts).values({
            paymentId: record.id,
            receiptNumber: `PENDING-${record.id}`,
            serviceName: input.serviceName,
            purpose: input.purpose,
            tournamentId: input.tournamentId,
            buyerUserId: userId,
            subtotal: input.amount.toString(),
            platformFeeAmount: input.platformFeeAmount.toString(),
            totalAmount: input.amount.toString(),
            snapshot: { status: 'PENDING', amount: input.amount, purpose: input.purpose },
        });
        return record;
    }
    async recordWebhookEvent(input) {
        const [event] = await this.db
            .insert(schema.paymentWebhookEvents)
            .values({
            eventKey: input.eventKey,
            paymentId: input.paymentId,
            providerOrderCode: input.providerOrderCode,
            providerTransactionId: input.providerTransactionId,
            statusCode: input.statusCode,
            amount: input.amount.toString(),
            signatureVerified: true,
            payload: input.payload,
        })
            .onConflictDoNothing({ target: schema.paymentWebhookEvents.eventKey })
            .returning();
        return event ?? null;
    }
    async finalizeReceipt(paymentId, payment, webhook) {
        const receiptNumber = `VNS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${payment.id.slice(0, 8).toUpperCase()}`;
        const [receipt] = await this.db
            .update(schema.paymentReceipts)
            .set({
            receiptNumber,
            snapshot: { ...webhook, paymentId: payment.id, orderCode: payment.providerOrderCode },
        })
            .where((0, drizzle_orm_1.eq)(schema.paymentReceipts.paymentId, paymentId))
            .returning();
        return receipt ?? null;
    }
    async attachPayOSLink(paymentId, orderCode) {
        const [record] = await this.db
            .update(schema.payments)
            .set({
            providerOrderCode: orderCode,
            transactionReference: orderCode,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.id, paymentId), (0, drizzle_orm_1.eq)(schema.payments.status, 'PENDING')))
            .returning();
        return record ?? null;
    }
    async transitionPayment(paymentId, expectedStatus, newStatus, reason, gatewayResponse, providerTransactionId) {
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
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.id, paymentId), (0, drizzle_orm_1.eq)(schema.payments.status, expectedStatus)))
                .returning();
            if (!updated) {
                const [current] = await tx
                    .select()
                    .from(schema.payments)
                    .where((0, drizzle_orm_1.eq)(schema.payments.id, paymentId))
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
                        .where((0, drizzle_orm_1.eq)(schema.tournamentParticipants.id, updated.participantId));
                }
                await tx.insert(schema.financialLedgerEntries).values({
                    tournamentId: updated.tournamentId,
                    paymentId: updated.id,
                    entryType: 'PAYMENT_CAPTURED',
                    direction: 'CREDIT',
                    amount: updated.amount,
                    idempotencyKey: `payment:${updated.id}:captured`,
                });
                const retainedAmount = updated.purpose === create_payment_dto_1.PaymentPurpose.REGISTRATION_FEE
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
    async setTournamentStatus(tournamentId, status) {
        return this.db
            .update(schema.tournaments)
            .set({ status, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId));
    }
    async findUserPayments(userId) {
        return this.db
            .select({
            payment: schema.payments,
            tournament: { id: schema.tournaments.id, name: schema.tournaments.name },
        })
            .from(schema.payments)
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.payments.tournamentId, schema.tournaments.id))
            .where((0, drizzle_orm_1.eq)(schema.payments.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(schema.payments.createdAt));
    }
    async findPaymentReceipt(paymentId) {
        const [receipt] = await this.db
            .select()
            .from(schema.paymentReceipts)
            .where((0, drizzle_orm_1.eq)(schema.paymentReceipts.paymentId, paymentId))
            .limit(1);
        return receipt ?? null;
    }
    async findPayoutById(id) {
        const [record] = await this.db
            .select()
            .from(schema.organizerPayouts)
            .where((0, drizzle_orm_1.eq)(schema.organizerPayouts.id, id))
            .limit(1);
        return record ?? null;
    }
    async createPayoutRequest(organizerId, data) {
        return this.db.transaction(async (tx) => {
            await tx.execute((0, drizzle_orm_1.sql) `select pg_advisory_xact_lock(hashtext(${`payout:${data.tournamentId}`}))`);
            const [activePayout] = await tx
                .select({ id: schema.organizerPayouts.id })
                .from(schema.organizerPayouts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.organizerPayouts.tournamentId, data.tournamentId), (0, drizzle_orm_1.inArray)(schema.organizerPayouts.status, activePayoutStatuses)))
                .limit(1);
            if (activePayout)
                throw new Error('Giải đấu đang có một yêu cầu giải ngân chưa kết thúc.');
            const [openRefund] = await tx
                .select({ id: schema.paymentRefunds.id })
                .from(schema.paymentRefunds)
                .innerJoin(schema.payments, (0, drizzle_orm_1.eq)(schema.paymentRefunds.paymentId, schema.payments.id))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.tournamentId, data.tournamentId), (0, drizzle_orm_1.inArray)(schema.paymentRefunds.status, [
                'REQUESTED',
                'UNDER_REVIEW',
                'PROCESSING',
            ])))
                .limit(1);
            if (openRefund)
                throw new Error('Giải đấu còn yêu cầu hoàn tiền đang xử lý.');
            const [balance] = await tx
                .select({
                available: (0, drizzle_orm_1.sql) `coalesce(sum(case when ${schema.financialLedgerEntries.direction} = 'CREDIT' then ${schema.financialLedgerEntries.amount} else -${schema.financialLedgerEntries.amount} end), 0)`,
                collected: (0, drizzle_orm_1.sql) `coalesce(sum(case when ${schema.financialLedgerEntries.entryType} = 'PAYMENT_CAPTURED' then ${schema.financialLedgerEntries.amount} else 0 end), 0)`,
                retained: (0, drizzle_orm_1.sql) `coalesce(sum(case when ${schema.financialLedgerEntries.entryType} = 'PLATFORM_FEE_RETAINED' then ${schema.financialLedgerEntries.amount} else 0 end), 0)`,
            })
                .from(schema.financialLedgerEntries)
                .where((0, drizzle_orm_1.eq)(schema.financialLedgerEntries.tournamentId, data.tournamentId));
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
    async transitionPayout(id, expectedStatuses, status, adminId, data) {
        return this.db.transaction(async (tx) => {
            const [oldPayout] = await tx
                .select()
                .from(schema.organizerPayouts)
                .where((0, drizzle_orm_1.eq)(schema.organizerPayouts.id, id))
                .limit(1);
            if (!oldPayout)
                return null;
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
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.organizerPayouts.id, id), (0, drizzle_orm_1.inArray)(schema.organizerPayouts.status, expectedStatuses)))
                .returning();
            if (!updated)
                return null;
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
    async findOrganizerPayouts(organizerId) {
        return this.db
            .select({
            payout: schema.organizerPayouts,
            tournament: { id: schema.tournaments.id, name: schema.tournaments.name },
        })
            .from(schema.organizerPayouts)
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.organizerPayouts.tournamentId, schema.tournaments.id))
            .where((0, drizzle_orm_1.eq)(schema.organizerPayouts.organizerId, organizerId))
            .orderBy((0, drizzle_orm_1.desc)(schema.organizerPayouts.createdAt));
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
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.organizerPayouts.tournamentId, schema.tournaments.id))
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.organizerPayouts.organizerId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .orderBy((0, drizzle_orm_1.desc)(schema.organizerPayouts.createdAt));
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
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.payments.tournamentId, schema.tournaments.id))
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.payments.userId, schema.users.id))
            .leftJoin(schema.profiles, (0, drizzle_orm_1.eq)(schema.users.id, schema.profiles.userId))
            .orderBy((0, drizzle_orm_1.desc)(schema.payments.createdAt));
    }
    async getAdminStats() {
        const [users] = await this.db.select({ count: (0, drizzle_orm_1.sql) `count(*)::int` }).from(schema.users);
        const [communities] = await this.db.select({ count: (0, drizzle_orm_1.sql) `count(*)::int` }).from(schema.communities);
        const [tournaments] = await this.db.select({ count: (0, drizzle_orm_1.sql) `count(*)::int` }).from(schema.tournaments);
        const [paymentTotals] = await this.db
            .select({
            amount: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.payments.amount}), 0)`,
            fee: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.payments.platformFeeAmount}), 0)`,
        })
            .from(schema.payments)
            .where((0, drizzle_orm_1.eq)(schema.payments.status, 'COMPLETED'));
        const [payoutTotals] = await this.db
            .select({ amount: (0, drizzle_orm_1.sql) `coalesce(sum(${schema.organizerPayouts.amountRequested}), 0)` })
            .from(schema.organizerPayouts)
            .where((0, drizzle_orm_1.eq)(schema.organizerPayouts.status, 'PAID'));
        return {
            totalUsers: users?.count ?? 0,
            totalCommunities: communities?.count ?? 0,
            totalTournaments: tournaments?.count ?? 0,
            totalAmountProcessed: paymentTotals?.amount ?? '0.00',
            totalPlatformFee: paymentTotals?.fee ?? '0.00',
            totalPayoutProcessed: payoutTotals?.amount ?? '0.00',
        };
    }
    async confirmLegacyRefund(paymentId, adminId, proofUrl) {
        return this.db.transaction(async (tx) => {
            const [payment] = await tx
                .select()
                .from(schema.payments)
                .where((0, drizzle_orm_1.eq)(schema.payments.id, paymentId))
                .limit(1);
            if (!payment || payment.status !== 'COMPLETED' || payment.refundStatus !== 'PENDING_REFUND') {
                return null;
            }
            const [updated] = await tx
                .update(schema.payments)
                .set({ refundStatus: 'REFUNDED', refundedAmount: payment.amount, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.payments.id, paymentId), (0, drizzle_orm_1.eq)(schema.payments.refundStatus, 'PENDING_REFUND')))
                .returning();
            if (!updated)
                return null;
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
};
exports.PaymentsRepository = PaymentsRepository;
exports.PaymentsRepository = PaymentsRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], PaymentsRepository);
//# sourceMappingURL=payments.repository.js.map