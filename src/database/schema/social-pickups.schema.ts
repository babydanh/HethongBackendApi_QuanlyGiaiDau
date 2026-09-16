import {
  boolean,
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
import { tournamentVenues, venueCourts, courtBookings } from './venues.schema';

/**
 * Social Pickup Session (Kèo giao lưu thể thao)
 * - BẮT BUỘC có Câu Lạc Bộ (communityId notNull): Mọi kèo giao lưu đều trực thuộc 1 CLB
 */
export const socialPickupSessions = pgTable(
  'social_pickup_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostUserId: uuid('host_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    communityId: uuid('community_id')
      .references(() => communities.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'restrict' })
      .notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    playDate: date('play_date').notNull(),
    startTime: varchar('start_time', { length: 8 }).notNull(),
    endTime: varchar('end_time', { length: 8 }).notNull(),
    
    venueId: uuid('venue_id').references(() => tournamentVenues.id, {
      onDelete: 'set null',
    }),
    courtId: uuid('court_id').references(() => venueCourts.id, {
      onDelete: 'set null',
    }),
    bookingId: uuid('booking_id').references(() => courtBookings.id, {
      onDelete: 'set null',
    }),
    courtLocation: varchar('court_location', { length: 255 }).notNull(),
    
    feePerSlot: integer('fee_per_slot').default(0).notNull(),
    maxSlots: integer('max_slots').default(4).notNull(),
    currentSlots: integer('current_slots').default(1).notNull(),
    
    matchType: varchar('match_type', { length: 30 }).default('DOUBLES').notNull(),
    levelRequirement: varchar('level_requirement', { length: 50 }).default('ALL').notNull(),
    genderRequirement: varchar('gender_requirement', { length: 20 }).default('ANY').notNull(),
    
    isClubExclusive: boolean('is_club_exclusive').default(false).notNull(),
    isRanked: boolean('is_ranked').default(false).notNull(),
    
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
      'social_pickup_status_check',
      sql`${table.status} IN ('OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    ),
    dateIdx: index('social_pickup_date_idx').on(
      table.playDate,
      table.status,
      table.categoryId,
    ),
    communityIdx: index('social_pickup_community_idx').on(
      table.communityId,
      table.status,
    ),
    hostIdx: index('social_pickup_host_idx').on(table.hostUserId),
  }),
);

export const socialPickupParticipants = pgTable(
  'social_pickup_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pickupId: uuid('pickup_id')
      .references(() => socialPickupSessions.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    role: varchar('role', { length: 20 }).default('PLAYER').notNull(),
    status: varchar('status', { length: 20 }).default('JOINED').notNull(),
    paymentStatus: varchar('payment_status', { length: 20 })
      .default('UNPAID')
      .notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueUserPickup: uniqueIndex(
      'social_pickup_participants_unique_user',
    ).on(table.pickupId, table.userId),
    pickupIdx: index('social_pickup_participants_pickup_idx').on(
      table.pickupId,
      table.status,
    ),
  }),
);
