"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payoutStatusLogs = exports.financialLedgerEntries = exports.organizerPayouts = exports.paymentReceipts = exports.paymentWebhookEvents = exports.paymentStatusLogs = exports.paymentRefunds = exports.payments = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_schema_1 = require("./users.schema");
const tournaments_schema_1 = require("./tournaments.schema");
exports.payments = (0, pg_core_1.pgTable)('payments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    participantId: (0, pg_core_1.uuid)('participant_id').references(() => tournaments_schema_1.tournamentParticipants.id, { onDelete: 'restrict' }),
    tournamentId: (0, pg_core_1.uuid)('tournament_id')
        .references(() => tournaments_schema_1.tournaments.id, { onDelete: 'restrict' })
        .notNull(),
    divisionId: (0, pg_core_1.uuid)('division_id'),
    purpose: (0, pg_core_1.varchar)('purpose', { length: 50 })
        .default('REGISTRATION_FEE')
        .notNull(),
    amount: (0, pg_core_1.numeric)('amount', { precision: 12, scale: 2 }).notNull(),
    platformFeeAmount: (0, pg_core_1.numeric)('platform_fee_amount', {
        precision: 12,
        scale: 2,
    }),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('PENDING').notNull(),
    refundStatus: (0, pg_core_1.varchar)('refund_status', { length: 50 }),
    refundedAmount: (0, pg_core_1.numeric)('refunded_amount', { precision: 12, scale: 2 }).default('0.00'),
    paymentGateway: (0, pg_core_1.varchar)('payment_gateway', { length: 50 }),
    providerOrderCode: (0, pg_core_1.varchar)('provider_order_code', { length: 50 }),
    providerTransactionId: (0, pg_core_1.varchar)('provider_transaction_id', { length: 255 }),
    idempotencyKey: (0, pg_core_1.varchar)('idempotency_key', { length: 255 }),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }),
    refundBankName: (0, pg_core_1.varchar)('refund_bank_name', { length: 100 }),
    refundAccountNumber: (0, pg_core_1.varchar)('refund_account_number', { length: 50 }),
    refundAccountName: (0, pg_core_1.varchar)('refund_account_name', { length: 255 }),
    transactionReference: (0, pg_core_1.varchar)('transaction_reference', {
        length: 255,
    }).unique(),
    gatewayResponse: (0, pg_core_1.jsonb)('gateway_response'),
    paidAt: (0, pg_core_1.timestamp)('paid_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    amountPositive: (0, pg_core_1.check)('amount_positive', (0, drizzle_orm_1.sql) `${table.amount} > 0`),
    providerOrderCodeUnique: (0, pg_core_1.uniqueIndex)('payments_provider_order_code_uidx').on(table.providerOrderCode),
    idempotencyKeyUnique: (0, pg_core_1.uniqueIndex)('payments_idempotency_key_uidx').on(table.idempotencyKey),
}));
exports.paymentRefunds = (0, pg_core_1.pgTable)('payment_refunds', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    paymentId: (0, pg_core_1.uuid)('payment_id')
        .references(() => exports.payments.id, { onDelete: 'restrict' })
        .notNull(),
    amount: (0, pg_core_1.numeric)('amount', { precision: 12, scale: 2 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('REQUESTED').notNull(),
    reason: (0, pg_core_1.text)('reason').notNull(),
    bankName: (0, pg_core_1.varchar)('bank_name', { length: 100 }),
    bankAccountNumber: (0, pg_core_1.varchar)('bank_account_number', { length: 50 }),
    bankAccountName: (0, pg_core_1.varchar)('bank_account_name', { length: 255 }),
    transactionProofUrl: (0, pg_core_1.text)('transaction_proof_url'),
    requestedBy: (0, pg_core_1.uuid)('requested_by').references(() => users_schema_1.users.id, { onDelete: 'restrict' }),
    processedBy: (0, pg_core_1.uuid)('processed_by').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    processedAt: (0, pg_core_1.timestamp)('processed_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    amountPositive: (0, pg_core_1.check)('payment_refund_amount_positive', (0, drizzle_orm_1.sql) `${table.amount} > 0`),
}));
exports.paymentStatusLogs = (0, pg_core_1.pgTable)('payment_status_logs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    paymentId: (0, pg_core_1.uuid)('payment_id')
        .references(() => exports.payments.id, { onDelete: 'restrict' })
        .notNull(),
    previousStatus: (0, pg_core_1.varchar)('previous_status', { length: 50 }).notNull(),
    newStatus: (0, pg_core_1.varchar)('new_status', { length: 50 }).notNull(),
    changedBy: (0, pg_core_1.uuid)('changed_by').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    reason: (0, pg_core_1.text)('reason'),
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 45 }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.paymentWebhookEvents = (0, pg_core_1.pgTable)('payment_webhook_events', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    eventKey: (0, pg_core_1.varchar)('event_key', { length: 255 }).notNull().unique(),
    paymentId: (0, pg_core_1.uuid)('payment_id').references(() => exports.payments.id, { onDelete: 'set null' }),
    providerOrderCode: (0, pg_core_1.varchar)('provider_order_code', { length: 50 }).notNull(),
    providerTransactionId: (0, pg_core_1.varchar)('provider_transaction_id', { length: 255 }),
    statusCode: (0, pg_core_1.varchar)('status_code', { length: 20 }).notNull(),
    amount: (0, pg_core_1.numeric)('amount', { precision: 12, scale: 2 }).notNull(),
    signatureVerified: (0, pg_core_1.boolean)('signature_verified').default(false).notNull(),
    payload: (0, pg_core_1.jsonb)('payload').notNull(),
    processedAt: (0, pg_core_1.timestamp)('processed_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    providerOrderCodeIdx: (0, pg_core_1.index)('payment_webhook_events_order_code_idx').on(table.providerOrderCode),
}));
exports.paymentReceipts = (0, pg_core_1.pgTable)('payment_receipts', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    paymentId: (0, pg_core_1.uuid)('payment_id')
        .references(() => exports.payments.id, { onDelete: 'restrict' })
        .notNull()
        .unique(),
    receiptNumber: (0, pg_core_1.varchar)('receipt_number', { length: 50 }).notNull().unique(),
    serviceName: (0, pg_core_1.varchar)('service_name', { length: 255 }).notNull(),
    purpose: (0, pg_core_1.varchar)('purpose', { length: 50 }).notNull(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id').references(() => tournaments_schema_1.tournaments.id, { onDelete: 'set null' }),
    buyerUserId: (0, pg_core_1.uuid)('buyer_user_id').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    subtotal: (0, pg_core_1.numeric)('subtotal', { precision: 12, scale: 2 }).notNull(),
    platformFeeAmount: (0, pg_core_1.numeric)('platform_fee_amount', { precision: 12, scale: 2 }).default('0.00').notNull(),
    taxAmount: (0, pg_core_1.numeric)('tax_amount', { precision: 12, scale: 2 }).default('0.00').notNull(),
    totalAmount: (0, pg_core_1.numeric)('total_amount', { precision: 12, scale: 2 }).notNull(),
    currency: (0, pg_core_1.varchar)('currency', { length: 3 }).default('VND').notNull(),
    issuedAt: (0, pg_core_1.timestamp)('issued_at', { withTimezone: true }).defaultNow().notNull(),
    snapshot: (0, pg_core_1.jsonb)('snapshot').notNull(),
});
exports.organizerPayouts = (0, pg_core_1.pgTable)('organizer_payouts', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id')
        .references(() => tournaments_schema_1.tournaments.id, { onDelete: 'restrict' })
        .notNull(),
    organizerId: (0, pg_core_1.uuid)('organizer_id')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    totalCollected: (0, pg_core_1.numeric)('total_collected', {
        precision: 12,
        scale: 2,
    }).notNull(),
    amountRequested: (0, pg_core_1.numeric)('amount_requested', {
        precision: 12,
        scale: 2,
    }).notNull(),
    platformFeeRetained: (0, pg_core_1.numeric)('platform_fee_retained', {
        precision: 12,
        scale: 2,
    }).notNull(),
    bankName: (0, pg_core_1.varchar)('bank_name', { length: 100 }),
    bankAccountNumber: (0, pg_core_1.varchar)('bank_account_number', { length: 50 }),
    bankAccountName: (0, pg_core_1.varchar)('bank_account_name', { length: 255 }),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('PENDING').notNull(),
    holdUntil: (0, pg_core_1.timestamp)('hold_until', { withTimezone: true }),
    payoutTrigger: (0, pg_core_1.varchar)('payout_trigger', { length: 50 }).default('MANUAL').notNull(),
    disbursedAt: (0, pg_core_1.timestamp)('disbursed_at', { withTimezone: true }),
    transactionProofUrl: (0, pg_core_1.text)('transaction_proof_url'),
    processedBy: (0, pg_core_1.uuid)('processed_by').references(() => users_schema_1.users.id),
    processedAt: (0, pg_core_1.timestamp)('processed_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    payoutAmountsValid: (0, pg_core_1.check)('payout_amounts_valid', (0, drizzle_orm_1.sql) `${table.amountRequested} > 0 AND ${table.platformFeeRetained} >= 0 AND ${table.totalCollected} >= ${table.amountRequested} + ${table.platformFeeRetained}`),
}));
exports.financialLedgerEntries = (0, pg_core_1.pgTable)('financial_ledger_entries', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id')
        .references(() => tournaments_schema_1.tournaments.id, { onDelete: 'restrict' })
        .notNull(),
    paymentId: (0, pg_core_1.uuid)('payment_id').references(() => exports.payments.id, { onDelete: 'restrict' }),
    refundId: (0, pg_core_1.uuid)('refund_id').references(() => exports.paymentRefunds.id, { onDelete: 'restrict' }),
    payoutId: (0, pg_core_1.uuid)('payout_id').references(() => exports.organizerPayouts.id, { onDelete: 'restrict' }),
    entryType: (0, pg_core_1.varchar)('entry_type', { length: 50 }).notNull(),
    direction: (0, pg_core_1.varchar)('direction', { length: 10 }).notNull(),
    amount: (0, pg_core_1.numeric)('amount', { precision: 12, scale: 2 }).notNull(),
    idempotencyKey: (0, pg_core_1.varchar)('idempotency_key', { length: 255 }).notNull().unique(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    amountPositive: (0, pg_core_1.check)('ledger_amount_positive', (0, drizzle_orm_1.sql) `${table.amount} > 0`),
    directionValid: (0, pg_core_1.check)('ledger_direction_valid', (0, drizzle_orm_1.sql) `${table.direction} IN ('CREDIT', 'DEBIT')`),
}));
exports.payoutStatusLogs = (0, pg_core_1.pgTable)('payout_status_logs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    payoutId: (0, pg_core_1.uuid)('payout_id')
        .references(() => exports.organizerPayouts.id, { onDelete: 'restrict' })
        .notNull(),
    previousStatus: (0, pg_core_1.varchar)('previous_status', { length: 50 }).notNull(),
    newStatus: (0, pg_core_1.varchar)('new_status', { length: 50 }).notNull(),
    changedBy: (0, pg_core_1.uuid)('changed_by').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    note: (0, pg_core_1.text)('note'),
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 45 }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
//# sourceMappingURL=payments.schema.js.map