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
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { tournaments, tournamentParticipants } from './tournaments.schema';

/**
 * Thanh toán PayOS cho một khoản của giải đấu: lệ phí đăng ký, phí đăng bài giải hoặc phí nền tảng.
 * Vòng đời: PENDING → COMPLETED (webhook PayOS mã "00") hoặc FAILED/CANCELLED; hoàn tiền theo `refundStatus`.
 * Khi COMPLETED, ghi bút toán vào `financial_ledger_entries`.
 */
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
    /** Hạng mục (division) để lấy lệ phí riêng khi tính REGISTRATION_FEE. Không có khóa ngoại. */
    divisionId: uuid('division_id'),
    /**
     * Mục đích thanh toán (enum `PaymentPurpose`, dto/create-payment.dto.ts):
     * REGISTRATION_FEE (lệ phí đăng ký), TOURNAMENT_PUBLISH_FEE (phí đăng bài giải, chỉ người tạo giải),
     * PLATFORM_FEE (phí nền tảng, chỉ khi giải đã đóng đăng ký).
     */
    purpose: varchar('purpose', { length: 50 })
      .default('REGISTRATION_FEE')
      .notNull(),
    /** Số tiền khách phải trả, đơn vị VND, phải > 0 (`amount_positive`). Webhook phải khớp số này. */
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    /**
     * Phí nền tảng trên khoản này. REGISTRATION_FEE: min(amount, phí × số người chơi).
     * TOURNAMENT_PUBLISH_FEE và PLATFORM_FEE: bằng amount (payments.service.ts).
     */
    platformFeeAmount: numeric('platform_fee_amount', {
      precision: 12,
      scale: 2,
    }),
    /**
     * Trạng thái thanh toán: PENDING → COMPLETED | FAILED | CANCELLED. Enum `PaymentStatus` (common/constants/enums.ts) không có CANCELLED,
     * nhưng code vẫn ghi giá trị này khi payment bị hủy vì không còn đủ điều kiện hoàn tất (payments.service.ts).
     */
    status: varchar('status', { length: 50 }).default('PENDING').notNull(),
    /**
     * Trạng thái hoàn tiền: PENDING_REFUND (đã có yêu cầu) → REFUNDED (admin xác nhận).
     * Null: chưa có yêu cầu hoàn. Enum `RefundStatus` trong common/constants/enums.ts.
     */
    refundStatus: varchar('refund_status', { length: 50 }),
    /** Tổng tiền đã hoàn, cộng dồn khi admin xác nhận hoàn (`confirmLegacyRefund`). */
    refundedAmount: numeric('refunded_amount', { precision: 12, scale: 2 }).default('0.00'),
    paymentGateway: varchar('payment_gateway', { length: 50 }),
    /** Mã đơn gửi lên PayOS (orderCode). Duy nhất. */
    providerOrderCode: varchar('provider_order_code', { length: 50 }),
    providerTransactionId: varchar('provider_transaction_id', { length: 255 }),
    /** Khóa chống tạo trùng: `{userId}:{clientKey}`, tối đa 255 ký tự. Duy nhất. */
    idempotencyKey: varchar('idempotency_key', { length: 255 }),
    /** Hạn thanh toán: 15 phút sau khi tạo link. Chỉ payment PENDING còn hạn mới được dùng lại (payments.repository.ts). */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    refundBankName: varchar('refund_bank_name', { length: 100 }),
    refundAccountNumber: varchar('refund_account_number', { length: 50 }),
    refundAccountName: varchar('refund_account_name', { length: 255 }),
    /** Mã tham chiếu giao dịch; được gán bằng orderCode khi gắn link PayOS. Duy nhất. */
    transactionReference: varchar('transaction_reference', {
      length: 255,
    }).unique(),
    /** Phản hồi của cổng thanh toán, ghi khi đổi trạng thái payment (`transitionPayment`). */
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

/**
 * Yêu cầu hoàn tiền cho một payment. Tạo ở REQUESTED cùng lúc payment chuyển refundStatus sang PENDING_REFUND.
 * Admin xác nhận đã chuyển khoản thì thành PAID và ghi bút toán REFUND_PAID.
 */
export const paymentRefunds = pgTable(
  'payment_refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .references(() => payments.id, { onDelete: 'restrict' })
      .notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    /**
     * Trạng thái yêu cầu hoàn. Trong code đã đọc chỉ thấy REQUESTED (tạo khi payment chuyển sang PENDING_REFUND)
     * và PAID (admin xác nhận đã chuyển khoản). Xem `confirmLegacyRefund`.
     */
    status: varchar('status', { length: 50 }).default('REQUESTED').notNull(),
    /**
     * Lý do hoàn tiền. Nếu thuộc danh sách `platformFeeReversalReasons` (payments.repository.ts)
     * thì phí nền tảng được hoàn lại (bút toán PLATFORM_FEE_REVERSED).
     */
    reason: text('reason').notNull(),
    bankName: varchar('bank_name', { length: 100 }),
    bankAccountNumber: varchar('bank_account_number', { length: 50 }),
    bankAccountName: varchar('bank_account_name', { length: 255 }),
    /** URL chứng từ chuyển khoản hoàn tiền; bắt buộc khi admin xác nhận (`confirm-refund.dto.ts`). */
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

// Immutable gateway evidence and order snapshot. These tables intentionally do
// not store card or bank-account details returned by a payment provider.
export const paymentWebhookEvents = pgTable(
  'payment_webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventKey: varchar('event_key', { length: 255 }).notNull().unique(),
    paymentId: uuid('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    providerOrderCode: varchar('provider_order_code', { length: 50 }).notNull(),
    providerTransactionId: varchar('provider_transaction_id', { length: 255 }),
    statusCode: varchar('status_code', { length: 20 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    signatureVerified: boolean('signature_verified').default(false).notNull(),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    providerOrderCodeIdx: index('payment_webhook_events_order_code_idx').on(table.providerOrderCode),
  }),
);

export const paymentReceipts = pgTable(
  'payment_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    paymentId: uuid('payment_id')
      .references(() => payments.id, { onDelete: 'restrict' })
      .notNull()
      .unique(),
    receiptNumber: varchar('receipt_number', { length: 50 }).notNull().unique(),
    serviceName: varchar('service_name', { length: 255 }).notNull(),
    purpose: varchar('purpose', { length: 50 }).notNull(),
    tournamentId: uuid('tournament_id').references(() => tournaments.id, { onDelete: 'set null' }),
    buyerUserId: uuid('buyer_user_id').references(() => users.id, { onDelete: 'set null' }),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
    platformFeeAmount: numeric('platform_fee_amount', { precision: 12, scale: 2 }).default('0.00').notNull(),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).default('0.00').notNull(),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).default('VND').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
    snapshot: jsonb('snapshot').notNull(),
  },
);

/**
 * Yêu cầu chi trả cho BTC (organizer) từ lệ phí đăng ký của một giải.
 * BTC tự yêu cầu (REQUESTED) khi giải COMPLETED. Hệ thống tự tạo bản ghi khi giải khóa đăng ký, xem `status` và `payoutTrigger`.
 */
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
    /** Tổng lệ phí đăng ký đã thu (payment REGISTRATION_FEE ở trạng thái COMPLETED) tại thời điểm khóa đăng ký. */
    totalCollected: numeric('total_collected', {
      precision: 12,
      scale: 2,
    }).notNull(),
    /** Số tiền BTC được rút. Ràng buộc payout_amounts_valid: amountRequested > 0 và totalCollected ≥ amountRequested + platformFeeRetained. */
    amountRequested: numeric('amount_requested', {
      precision: 12,
      scale: 2,
    }).notNull(),
    /** Tổng phí nền tảng đã giữ trên các lệ phí đăng ký của giải tại thời điểm khóa đăng ký. */
    platformFeeRetained: numeric('platform_fee_retained', {
      precision: 12,
      scale: 2,
    }).notNull(),
    bankName: varchar('bank_name', { length: 100 }),
    bankAccountNumber: varchar('bank_account_number', { length: 50 }),
    bankAccountName: varchar('bank_account_name', { length: 255 }),
    /**
     * Trạng thái chi trả. Luồng: REQUESTED → UNDER_REVIEW → APPROVED → PROCESSING → PAID, hoặc REJECTED
     * (chuyển hợp lệ theo `payoutExpectedStatuses` trong payments.service.ts).
     * HELD_IN_ESCROW và PENDING_DISBURSEMENT do hệ thống tự đặt (khi khóa đăng ký hoặc khi giải COMPLETED).
     */
    status: varchar('status', { length: 50 }).default('PENDING').notNull(),
    /** Hạn giữ ký quỹ: ngày kết thúc giải với BTC chưa đủ uy tín; null với BTC đủ uy tín. */
    holdUntil: timestamp('hold_until', { withTimezone: true }),
    /**
     * Cách chi trả được kích hoạt. AUTO_ON_LOCK: BTC đủ uy tín, tạo ở PENDING_DISBURSEMENT ngay khi khóa đăng ký.
     * MANUAL_ON_COMPLETE: BTC chưa đủ uy tín, giữ ở HELD_IN_ESCROW tới khi giải COMPLETED. MANUAL: mặc định của schema.
     */
    payoutTrigger: varchar('payout_trigger', { length: 50 }).default('MANUAL').notNull(),
    disbursedAt: timestamp('disbursed_at', { withTimezone: true }),
    /** URL chứng từ chuyển khoản do admin nhập khi duyệt (tùy chọn trong DTO review-payout). PAID đặt disbursedAt. */
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

/**
 * Sổ cái tài chính theo giải đấu. Số dư khả dụng của BTC = tổng CREDIT − tổng DEBIT (dùng khi BTC yêu cầu rút).
 * Thanh toán hoàn tất, hoàn tiền và yêu cầu rút đều ghi thêm bút toán.
 */
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
    /**
     * Loại bút toán. Các giá trị dùng trong code:
     * PAYMENT_CAPTURED (CREDIT, khách đã trả) · PLATFORM_FEE_RETAINED (DEBIT, phí nền tảng giữ lại) ·
     * PAYOUT_RESERVED (DEBIT, giữ tiền khi BTC yêu cầu rút) · PAYOUT_RELEASED (CREDIT, nhả lại khi payout bị từ chối) ·
     * REFUND_PAID (DEBIT, đã hoàn cho khách) · PLATFORM_FEE_REVERSED (CREDIT, hoàn phí nền tảng khi lý do hoàn thuộc danh sách được hoàn phí).
     */
    entryType: varchar('entry_type', { length: 50 }).notNull(),
    /** CREDIT tăng số dư của giải; DEBIT giảm số dư (ràng buộc `ledger_direction_valid`). */
    direction: varchar('direction', { length: 10 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    /** Khóa duy nhất chống ghi trùng bút toán, ví dụ `refund:{refundId}:paid`. */
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
