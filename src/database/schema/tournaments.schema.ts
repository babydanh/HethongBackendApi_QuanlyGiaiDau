import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  numeric,
  boolean,
  timestamp,
  integer,
  check,
  date,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { communities } from './communities.schema';
import { categories } from './categories.schema';
import { tournamentVenues } from './venues.schema';

export const tournaments = pgTable(
  'tournaments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id').references(() => communities.id, {
      onDelete: 'set null',
    }),
    categoryId: uuid('category_id')
      .references(() => categories.id)
      .notNull(),
    createdBy: uuid('created_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 50 }).default('DRAFT').notNull(),
    matchType: varchar('match_type', { length: 50 }).default('DOUBLES').notNull(),
    sportRules: jsonb('sport_rules').notNull(),
    tournamentConfig: jsonb('tournament_config').notNull(),
    entryFee: numeric('entry_fee', { precision: 12, scale: 2 })
      .default('0.00')
      .notNull(),
    platformFeePercentage: numeric('platform_fee_percentage', {
      precision: 5,
      scale: 2,
    })
      .default('5.00')
      .notNull(),
    platformFeePerPlayer: integer('platform_fee_per_player').default(10000).notNull(),
    registrationStartDate: timestamp('registration_start_date', { withTimezone: true }),
    registrationEndDate: timestamp('registration_end_date', { withTimezone: true }),
    maxParticipants: integer('max_participants'),
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),
    venueId: uuid('venue_id').references(() => tournamentVenues.id, {
      onDelete: 'set null',
    }),
    tournamentType: varchar('tournament_type', { length: 50 }).default('CLUB').notNull(),
    bannerUrl: text('banner_url'),
    logoUrl: text('logo_url'),
    galleryImages: text('gallery_images')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    prizeDescription: text('prize_description'),
    prizes: jsonb('prizes').default(sql`'[]'::jsonb`),
    inviteCode: varchar('invite_code', { length: 20 }).unique(),
    contactInfo: jsonb('contact_info'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    entryFeeNonNegative: check(
      'entry_fee_non_negative',
      sql`${table.entryFee} >= 0`,
    ),
    platformFeeValid: check(
      'platform_fee_valid',
      sql`${table.platformFeePercentage} >= 0 AND ${table.platformFeePercentage} <= 100`,
    ),
  }),
);

export const tournamentStages = pgTable('tournament_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .references(() => tournaments.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  order: integer('order').notNull(),
  roundConfig: jsonb('round_config'),
  venueId: uuid('venue_id').references(() => tournamentVenues.id, { onDelete: 'set null' }),
  scheduledDate: date('scheduled_date'),
  notificationNote: text('notification_note'),
});

export const tournamentGroups = pgTable('tournament_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  stageId: uuid('stage_id')
    .references(() => tournamentStages.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const tournamentParticipants = pgTable('tournament_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .references(() => tournaments.id, { onDelete: 'cascade' })
    .notNull(),
  groupId: uuid('group_id').references(() => tournamentGroups.id, {
    onDelete: 'set null',
  }),
  registeredBy: uuid('registered_by')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  teamName: varchar('team_name', { length: 255 }).notNull(),
  seed: integer('seed'),
  points: integer('points').default(0).notNull(),
  isPaid: boolean('is_paid').default(false).notNull(),
  registeredAt: timestamp('registered_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const tournamentRosters = pgTable('tournament_rosters', {
  id: uuid('id').primaryKey().defaultRandom(),
  participantId: uuid('participant_id')
    .references(() => tournamentParticipants.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  role: varchar('role', { length: 50 }).default('MAIN').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
