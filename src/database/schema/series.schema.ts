import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  timestamp,
  integer,
  numeric,
  real,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { tournaments, tournamentParticipants } from './tournaments.schema';
import { categories } from './categories.schema';

// 1. tournament_series
export const tournamentSeries = pgTable('tournament_series', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  bannerUrl: text('banner_url'),
  logoUrl: text('logo_url'),
  organizerId: uuid('organizer_id')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  status: varchar('status', { length: 50 }).default('DRAFT').notNull(), // DRAFT, ACTIVE, COMPLETED, CANCELLED
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  totalPrize: numeric('total_prize', { precision: 12, scale: 2 }),
  rules: jsonb('rules').default(sql`'{}'::jsonb`).notNull(), // PsrPointConfig JSON
  visibility: varchar('visibility', { length: 50 }).default('PUBLIC').notNull(), // PUBLIC, PRIVATE
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// 2. series_legs
export const seriesLegs = pgTable('series_legs', {
  id: uuid('id').primaryKey().defaultRandom(),
  seriesId: uuid('series_id')
    .references(() => tournamentSeries.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  order: integer('order').notNull(),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  status: varchar('status', { length: 50 }).default('UPCOMING').notNull(), // UPCOMING, ONGOING, COMPLETED
  directEntrySlots: integer('direct_entry_slots').default(2).notNull(),
  wildcardSlots: integer('wildcard_slots').default(16).notNull(),
  rulesOverride: jsonb('rules_override'), // Overrides PsrPointConfig if needed
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 3. series_events
export const seriesEvents = pgTable('series_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  legId: uuid('leg_id')
    .references(() => seriesLegs.id, { onDelete: 'cascade' })
    .notNull(),
  tournamentId: uuid('tournament_id')
    .references(() => tournaments.id, { onDelete: 'cascade' })
    .notNull()
    .unique(), // 1 tournament belongs to 1 series event
  region: varchar('region', { length: 100 }),
  order: integer('order').notNull(),
  pointMultiplier: real('point_multiplier').default(1.0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 4. series_standings
export const seriesStandings = pgTable('series_standings', {
  id: uuid('id').primaryKey().defaultRandom(),
  legId: uuid('leg_id')
    .references(() => seriesLegs.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  categoryId: uuid('category_id')
    .references(() => categories.id, { onDelete: 'restrict' })
    .notNull(),
  totalPsrPoints: integer('total_psr_points').default(0).notNull(),
  eventsPlayed: integer('events_played').default(0).notNull(),
  bestRank: integer('best_rank'),
  directEntry: boolean('direct_entry').default(false).notNull(),
  wildcardEntry: boolean('wildcard_entry').default(false).notNull(),
  lockedOut: boolean('locked_out').default(false).notNull(),
  qualifiedEventId: uuid('qualified_event_id')
    .references(() => seriesEvents.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 5. psr_point_logs
export const psrPointLogs = pgTable('psr_point_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  standingId: uuid('standing_id')
    .references(() => seriesStandings.id, { onDelete: 'cascade' })
    .notNull(),
  eventId: uuid('event_id')
    .references(() => seriesEvents.id, { onDelete: 'cascade' })
    .notNull(),
  participantId: uuid('participant_id')
    .references(() => tournamentParticipants.id, { onDelete: 'cascade' })
    .notNull(),
  rankAchieved: integer('rank_achieved').notNull(),
  basePoints: integer('base_points').notNull(),
  bonusPoints: integer('bonus_points').default(0).notNull(),
  multiplier: real('multiplier').default(1.0).notNull(),
  totalPoints: integer('total_points').notNull(),
  isDirectEntry: boolean('is_direct_entry').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
