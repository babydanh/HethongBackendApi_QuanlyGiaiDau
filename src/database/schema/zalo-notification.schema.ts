import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';

export const zaloNotificationOutbox = pgTable(
  'zalo_notification_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dedupeKey: varchar('dedupe_key', { length: 255 }).notNull(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    recipientUserId: uuid('recipient_user_id')
      .references(() => users.id, { onDelete: 'set null' }),
    aggregateType: varchar('aggregate_type', { length: 50 }).notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    payload: jsonb('payload')
      .$type<Record<string, string | null>>()
      .notNull(),
    status: varchar('status', { length: 20 }).default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    lastErrorCode: varchar('last_error_code', { length: 80 }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    dedupeUnique: uniqueIndex('zalo_notification_outbox_dedupe_unique').on(
      table.dedupeKey,
    ),
    claimIndex: index('zalo_notification_outbox_claim_idx').on(
      table.status,
      table.nextAttemptAt,
      table.createdAt,
    ),
    statusCheck: check(
      'zalo_notification_outbox_status_check',
      sql`${table.status} IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'BLOCKED')`,
    ),
    attemptsCheck: check(
      'zalo_notification_outbox_attempts_check',
      sql`${table.attempts} >= 0`,
    ),
  }),
);
