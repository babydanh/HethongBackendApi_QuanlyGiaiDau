import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
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

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  targetType: varchar('target_type', { length: 50 }).notNull(), // 'USER', 'TOURNAMENT'
  targetId: uuid('target_id').notNull(),
  reason: text('reason').notNull(),
  evidenceUrls: text('evidence_urls')
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(), // 'PENDING', 'RESOLVED', 'REJECTED'
  resolvedBy: uuid('resolved_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  resolutionNote: text('resolution_note'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});
