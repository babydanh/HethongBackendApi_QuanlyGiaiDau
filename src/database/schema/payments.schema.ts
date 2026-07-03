import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  jsonb,
  timestamp,
  check,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { tournaments, tournamentParticipants } from './tournaments.schema';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    participantId: uuid('participant_id').references(
      () => tournamentParticipants.id,
      { onDelete: 'restrict' },
    ),
    tournamentId: uuid('tournament_id')
      .references(() => tournaments.id, { onDelete: 'restrict' })
      .notNull(),
    divisionId: uuid('division_id'),
    purpose: varchar('purpose', { length: 50 })
      .default('REGISTRATION_FEE')
      .notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    platformFeeAmount: numeric('platform_fee_amount', {
      precision: 12,
      scale: 2,
    }),
    status: varchar('status', { length: 50 }).default('PENDING').notNull(),
    refundStatus: varchar('refund_status', { length: 50 }),
    refundedAmount: numeric('refunded_amount', { precision: 12, scale: 2 }).default('0.00'),
    paymentGateway: varchar('payment_gateway', { length: 50 }),
    providerOrderCode: varchar('provider_order_code', { length: 50 }),
    providerTransactionId: varchar('provider_transaction_id', { length: 255 }),
    idempotencyKey: varchar('idempotency_key', { length: 255 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    refundBankName: varchar('refund_bank_name', { length: 100 }),
    refundAccountNumber: varchar('refund_account_number', { length: 50 }),
    refundAccountName: varchar('refund_account_name', { length: 255 }),
    transactionReference: varchar('transaction_reference', {
      length: 255,
    }).unique(),
    gatewayResponse: jsonb('gateway_response'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    amountPositive: check('amount_positive', sql`${table.amount} > 0`),
    providerOrderCodeUnique: uniqueIndex('payments_provider_order_code_uidx').on(
      table.providerOrderCode,
    ),
    idempotencyKeyUnique: uniqueIndex('payments_idempotency_key_uidx').on(
      table.idempotencyKey,
    ),
  }),
);

export const paymentRefunds = pgTable(
  'payment_refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .references(() => payments.id, { onDelete: 'restrict' })
      .notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    status: varchar('status', { length: 50 }).default('REQUESTED').notNull(),
    reason: text('reason').notNull(),
    bankName: varchar('bank_name', { length: 100 }),
    bankAccountNumber: varchar('bank_account_number', { length: 50 }),
    bankAccountName: varchar('bank_account_name', { length: 255 }),
    transactionProofUrl: text('transaction_proof_url'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'restrict' }),
    processedBy: uuid('processed_by').references(() => users.id, { onDelete: 'set null' }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    amountPositive: check('payment_refund_amount_positive', sql`${table.amount} > 0`),
  }),
);

export const paymentStatusLogs = pgTable('payment_status_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id')
    .references(() => payments.id, { onDelete: 'restrict' })
    .notNull(),
  previousStatus: varchar('previous_status', { length: 50 }).notNull(),
  newStatus: varchar('new_status', { length: 50 }).notNull(),
  changedBy: uuid('changed_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  reason: text('reason'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const organizerPayouts = pgTable(
  'organizer_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .references(() => tournaments.id, { onDelete: 'restrict' })
      .notNull(),
    organizerId: uuid('organizer_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    totalCollected: numeric('total_collected', {
      precision: 12,
      scale: 2,
    }).notNull(),
    amountRequested: numeric('amount_requested', {
      precision: 12,
      scale: 2,
    }).notNull(),
    platformFeeRetained: numeric('platform_fee_retained', {
      precision: 12,
      scale: 2,
    }).notNull(),
    bankName: varchar('bank_name', { length: 100 }),
    bankAccountNumber: varchar('bank_account_number', { length: 50 }),
    bankAccountName: varchar('bank_account_name', { length: 255 }),
    status: varchar('status', { length: 50 }).default('PENDING').notNull(),
    holdUntil: timestamp('hold_until', { withTimezone: true }),
    payoutTrigger: varchar('payout_trigger', { length: 50 }).default('MANUAL').notNull(),
    disbursedAt: timestamp('disbursed_at', { withTimezone: true }),
    transactionProofUrl: text('transaction_proof_url'),
    processedBy: uuid('processed_by').references(() => users.id),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    payoutAmountsValid: check(
      'payout_amounts_valid',
      sql`${table.amountRequested} > 0 AND ${table.platformFeeRetained} >= 0 AND ${table.totalCollected} >= ${table.amountRequested} + ${table.platformFeeRetained}`,
    ),
  }),
);

export const financialLedgerEntries = pgTable(
  'financial_ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .references(() => tournaments.id, { onDelete: 'restrict' })
      .notNull(),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'restrict' }),
    refundId: uuid('refund_id').references(() => paymentRefunds.id, { onDelete: 'restrict' }),
    payoutId: uuid('payout_id').references(() => organizerPayouts.id, { onDelete: 'restrict' }),
    entryType: varchar('entry_type', { length: 50 }).notNull(),
    direction: varchar('direction', { length: 10 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull().unique(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    amountPositive: check('ledger_amount_positive', sql`${table.amount} > 0`),
    directionValid: check(
      'ledger_direction_valid',
      sql`${table.direction} IN ('CREDIT', 'DEBIT')`,
    ),
  }),
);

export const payoutStatusLogs = pgTable('payout_status_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  payoutId: uuid('payout_id')
    .references(() => organizerPayouts.id, { onDelete: 'restrict' })
    .notNull(),
  previousStatus: varchar('previous_status', { length: 50 }).notNull(),
  newStatus: varchar('new_status', { length: 50 }).notNull(),
  changedBy: uuid('changed_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  note: text('note'),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
