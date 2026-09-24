import {
  check,
  date,
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
import { categories } from './categories.schema';
import { communities } from './communities.schema';
import { users } from './users.schema';

/**
 * Social Session (Kèo giao lưu thể thao — Social của Flutter).
 * - communityId nullable: NULL = kèo cá nhân (nút "Xóa CLB"); có giá trị = kèo thuộc CLB.
 * - play_date tách riêng khỏi start_at để query list-theo-ngày nhanh; phải luôn = start_at::date.
 */
export const socialSessions = pgTable(
  'social_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id').references(() => communities.id, {
      onDelete: 'cascade',
    }),
    hostUserId: uuid('host_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'restrict' })
      .notNull(),
    title: varchar('title', { length: 100 }).notNull(),
    description: text('description'),
    playFormat: varchar('play_format', { length: 30 })
      .default('Giao lưu')
      .notNull(),
    playDate: date('play_date').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').default(120).notNull(),
    venueName: varchar('venue_name', { length: 255 }).notNull(),
    venueAddress: varchar('venue_address', { length: 500 }).notNull(),
    maxSlots: integer('max_slots').default(6).notNull(),
    currentSlots: integer('current_slots').default(1).notNull(),
    feePerSlot: integer('fee_per_slot').default(0).notNull(),
    levelRequirement: varchar('level_requirement', { length: 50 })
      .default('ALL')
      .notNull(),
    visibility: varchar('visibility', { length: 20 }).default('PUBLIC').notNull(),
    contactPhone: varchar('contact_phone', { length: 20 }),
    zaloGroupUrl: text('zalo_group_url'),
    status: varchar('status', { length: 20 }).default('OPEN').notNull(),
    metadata: jsonb('metadata').default('{}').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    statusCheck: check(
      'social_session_status_check',
      sql`${table.status} IN ('OPEN', 'FULL', 'COMPLETED', 'CANCELLED')`,
    ),
    capacityCheck: check(
      'social_session_capacity_check',
      sql`${table.maxSlots} BETWEEN 2 AND 64 AND ${table.currentSlots} BETWEEN 1 AND ${table.maxSlots}`,
    ),
    feeCheck: check('social_session_fee_check', sql`${table.feePerSlot} >= 0`),
    visibilityCheck: check(
      'social_session_visibility_check',
      sql`${table.visibility} IN ('PUBLIC', 'CLUB_ONLY') AND (${table.visibility} <> 'CLUB_ONLY' OR ${table.communityId} IS NOT NULL)`,
    ),
    dateIdx: index('social_session_date_idx').on(
      table.playDate,
      table.status,
      table.categoryId,
    ),
    communityIdx: index('social_session_community_idx').on(
      table.communityId,
      table.status,
    ),
    hostIdx: index('social_session_host_idx').on(table.hostUserId),
  }),
);

/**
 * Social Session Participant (1 row = 1 slot trong 1 kèo).
 * - userId nullable: NULL = khách ngoài CLB (guest, không cần tài khoản).
 * - guestName: tên hiển thị của khách ngoài (bắt buộc khi userId NULL).
 * Không hard-delete: rời/kick chỉ đổi status (JOINED/CANCELLED/KICKED) để giữ lịch sử.
 */
export const socialSessionParticipants = pgTable(
  'social_session_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => socialSessions.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    guestName: varchar('guest_name', { length: 100 }),
    role: varchar('role', { length: 20 }).default('PLAYER').notNull(),
    status: varchar('status', { length: 20 }).default('JOINED').notNull(),
    paymentStatus: varchar('payment_status', { length: 20 })
      .default('UNPAID')
      .notNull(),
    ticketCount: integer('ticket_count').default(1).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueUserSession: uniqueIndex(
      'social_session_participants_unique_user',
    ).on(table.sessionId, table.userId),
    roleCheck: check(
      'social_session_participants_role_check',
      sql`${table.role} IN ('HOST', 'PLAYER')`,
    ),
    statusCheck: check(
      'social_session_participants_status_check',
      sql`${table.status} IN ('JOINED', 'CANCELLED', 'KICKED')`,
    ),
    paymentCheck: check(
      'social_session_participants_payment_check',
      sql`${table.paymentStatus} IN ('UNPAID', 'PAID', 'PENDING')`,
    ),
    ticketCheck: check(
      'social_session_participants_ticket_check',
      sql`${table.ticketCount} >= 1`,
    ),
    guestCheck: check(
      'social_session_participants_guest_check',
      sql`(${table.userId} IS NOT NULL OR ${table.guestName} IS NOT NULL)`,
    ),
    sessionIdx: index('social_session_participants_session_idx').on(
      table.sessionId,
      table.status,
    ),
  }),
);
