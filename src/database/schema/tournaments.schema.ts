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
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { communities } from './communities.schema';
import { categories } from './categories.schema';
import { tournamentVenues } from './venues.schema';
import { tournamentDivisions } from './tournament_divisions.schema';

export const parentTournaments = pgTable('parent_tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  bannerUrl: text('banner_url'),
  logoUrl: text('logo_url'),
  sports: jsonb('sports').$type<string[]>().default([]).notNull(),
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const tournaments = pgTable(
  'tournaments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references(() => parentTournaments.id, {
      onDelete: 'cascade',
    }),
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
    visibility: varchar('visibility', { length: 50 }).default('PUBLIC').notNull(),
    genderRestriction: varchar('gender_restriction', { length: 20 }),
    contactInfo: jsonb('contact_info'),
    city: varchar('city', { length: 100 }),
    reservedSlotsCount: integer('reserved_slots_count').default(0).notNull(),
    isRanked: boolean('is_ranked').default(true).notNull(),
    isRegistrationLocked: boolean('is_registration_locked').default(false).notNull(),
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
    idxTournamentsStatusVisibility: index('idx_tournaments_status_visibility').on(
      table.status,
      table.visibility,
    ),
    idxTournamentsCreatedBy: index('idx_tournaments_created_by').on(
      table.createdBy,
    ),
  }),
);

export const tournamentStages = pgTable('tournament_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .references(() => tournaments.id, { onDelete: 'cascade' })
    .notNull(),
  tournamentDivisionId: uuid('tournament_division_id').references(
    () => tournamentDivisions.id,
    { onDelete: 'cascade' },
  ),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  order: integer('order').notNull(),
  roundConfig: jsonb('round_config'),
  venueId: uuid('venue_id').references(() => tournamentVenues.id, { onDelete: 'set null' }),
  scheduledDate: date('scheduled_date'),
  notificationNote: text('notification_note'),
  matchSettings: jsonb('match_settings'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  idxStagesTournamentDivision: index('idx_stages_tournament_division').on(
    table.tournamentId,
    table.tournamentDivisionId,
  ),
}));

export const tournamentGroups = pgTable('tournament_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  stageId: uuid('stage_id')
    .references(() => tournamentStages.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  idxGroupsStageId: index('idx_groups_stage_id').on(table.stageId),
}));

export const tournamentParticipants = pgTable('tournament_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .references(() => tournaments.id, { onDelete: 'cascade' })
    .notNull(),
  tournamentDivisionId: uuid('tournament_division_id').references(
    () => tournamentDivisions.id,
    { onDelete: 'cascade' },
  ),
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
  teamInviteToken: varchar('team_invite_token', { length: 50 }).unique(),
  teamStatus: varchar('team_status', { length: 50 }).default('PENDING').notNull(),
  isMock: boolean('is_mock').default(false).notNull(),
  isWildcard: boolean('is_wildcard').default(false).notNull(),
  registeredAt: timestamp('registered_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => ({
  idxParticipantsTournamentStatus: index('idx_participants_tournament_status').on(
    table.tournamentId,
    table.teamStatus,
  ),
  idxParticipantsTournamentId: index('idx_participants_tournament_id').on(
    table.tournamentId,
  ),
}));

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

export const tournamentReferees = pgTable('tournament_referees', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').references(() => tournaments.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 50 }).default('INVITED').notNull(), // 'INVITED' | 'ACCEPTED' | 'DECLINED'
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tournamentStaff = pgTable('tournament_staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .references(() => tournaments.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tournamentFollows = pgTable('tournament_follows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .references(() => tournaments.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueFollow: uniqueIndex('tournament_follows_unique_idx').on(table.tournamentId, table.userId),
}));
