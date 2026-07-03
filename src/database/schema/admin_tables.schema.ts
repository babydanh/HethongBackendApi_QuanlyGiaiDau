import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const verificationTickets = pgTable('verification_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  evidenceUrls: text('evidence_urls').array().notNull(), // Array of document or screenshot links
  contactPhone: varchar('contact_phone', { length: 20 }).notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(), // PENDING, APPROVED, REJECTED
  rejectReason: text('reject_reason'),
  reviewedBy: uuid('reviewed_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userBans = pgTable('user_bans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  bannedBy: uuid('banned_by')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  reason: text('reason').notNull(),
  banType: varchar('ban_type', { length: 50 }).default('SOFT_BAN').notNull(), // WARN, SOFT_BAN, HARD_BAN
  expiresAt: timestamp('expires_at', { withTimezone: true }), // null for permanent
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

export const systemConfigs = pgTable('system_configs', {
  key: varchar('key', { length: 100 }).primaryKey(), // E.g., 'PLATFORM_FEE_PERCENTAGE', 'DEFAULT_ELO_START'
  value: text('value').notNull(),
  description: text('description'),
  updatedBy: uuid('updated_by')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

import { sql } from 'drizzle-orm';

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    targetType: varchar('target_type', { length: 50 }).notNull(),
    targetId: uuid('target_id').notNull(),
    source: varchar('source', { length: 50 }).default('USER_REPORT').notNull(),
    sourceReferenceId: uuid('source_reference_id'),
    category: varchar('category', { length: 50 }).default('OTHER').notNull(),
    reason: text('reason').notNull(),
    evidenceUrls: text('evidence_urls')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    status: varchar('status', { length: 50 })
      .default('SUBMITTED')
      .notNull(),
    assignedTo: uuid('assigned_to').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedBy: uuid('resolved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolutionNote: text('resolution_note'),
    triagedAt: timestamp('triaged_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    targetTypeCheck: check(
      'reports_target_type_check',
      sql`${table.targetType} in ('USER', 'TOURNAMENT', 'MATCH', 'COMMUNITY')`,
    ),
    sourceCheck: check(
      'reports_source_check',
      sql`${table.source} in ('USER_REPORT', 'LEGACY_DISPUTE')`,
    ),
    categoryCheck: check(
      'reports_category_check',
      sql`${table.category} in ('CHEATING', 'RULE_VIOLATION', 'ABUSIVE_BEHAVIOR', 'FAKE_INFORMATION', 'PAYMENT_FRAUD', 'UNSAFE_ORGANIZATION', 'OTHER')`,
    ),
    statusCheck: check(
      'reports_status_check',
      sql`${table.status} in ('SUBMITTED', 'TRIAGED', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'REJECTED')`,
    ),
    queueIndex: index('reports_queue_idx').on(
      table.status,
      table.targetType,
      table.category,
      table.createdAt,
    ),
    reporterIndex: index('reports_reporter_idx').on(
      table.reporterId,
      table.createdAt,
    ),
    uniqueOpenReport: uniqueIndex('reports_unique_open_idx')
      .on(table.reporterId, table.targetType, table.targetId, table.category)
      .where(sql`${table.status} not in ('RESOLVED', 'REJECTED')`),
    uniqueSourceReference: uniqueIndex('reports_source_reference_unique_idx')
      .on(table.source, table.sourceReferenceId)
      .where(sql`${table.sourceReferenceId} is not null`),
    sourceReferenceIndex: index('reports_source_reference_idx').on(
      table.sourceReferenceId,
    ),
  }),
);

export const reportActions = pgTable(
  'report_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .references(() => reports.id, { onDelete: 'cascade' })
      .notNull(),
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 50 }).notNull(),
    fromStatus: varchar('from_status', { length: 50 }),
    toStatus: varchar('to_status', { length: 50 }).notNull(),
    note: text('note'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    reportTimelineIndex: index('report_actions_timeline_idx').on(
      table.reportId,
      table.createdAt,
    ),
  }),
);
