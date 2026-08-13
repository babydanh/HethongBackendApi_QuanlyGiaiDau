import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  integer,
  boolean,
  jsonb,
  text,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tournaments } from './tournaments.schema';
import { tournamentVenues } from './venues.schema';

export const tournamentDivisions = pgTable(
  'tournament_divisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .references(() => tournaments.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    matchType: varchar('match_type', { length: 50 }).notNull(),
    genderRestriction: varchar('gender_restriction', { length: 20 }),
    maxParticipants: integer('max_participants'),
    entryFee: numeric('entry_fee', { precision: 12, scale: 2 })
      .default('0')
      .notNull(),
    isConfigOverride: boolean('is_config_override').default(false).notNull(),
    venueId: uuid('venue_id').references(() => tournamentVenues.id, {
      onDelete: 'set null',
    }),
    bracketType: varchar('bracket_type', { length: 50 }),
    roundConfig: jsonb('round_config'),
    startDate: timestamp('start_date', { withTimezone: true }),
    registrationEndDate: timestamp('registration_end_date', {
      withTimezone: true,
    }),
    minElo: integer('min_elo'),
    maxElo: integer('max_elo'),
    prizeDescription: text('prize_description'),
    status: varchar('status', { length: 50 }).default('DRAFT').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);
