import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tournaments } from './tournaments.schema';
import { users } from './users.schema';

export const tournamentSponsors = pgTable(
  'tournament_sponsors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .references(() => tournaments.id, { onDelete: 'cascade' })
      .notNull(),
    displayName: varchar('display_name', { length: 160 }).notNull(),
    tier: varchar('tier', { length: 30 }).default('GOLD').notNull(),
    logoUrl: text('logo_url').notNull(),
    websiteUrl: text('website_url'),
    shortDescription: varchar('short_description', { length: 500 }),
    displayOrder: integer('display_order').default(0).notNull(),
    status: varchar('status', { length: 20 }).default('DRAFT').notNull(),
    isPublic: boolean('is_public').default(true).notNull(),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    updatedBy: uuid('updated_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    idxSponsorsTournamentLifecycle: index('idx_tournament_sponsors_tournament_lifecycle').on(
      table.tournamentId,
      table.status,
      table.isPublic,
      table.displayOrder,
    ),
    idxSponsorsDisplayWindow: index('idx_tournament_sponsors_display_window').on(
      table.tournamentId,
      table.startAt,
      table.endAt,
    ),
    displayOrderNonNegative: check(
      'tournament_sponsors_display_order_non_negative',
      sql`${table.displayOrder} >= 0`,
    ),
    displayWindowValid: check(
      'tournament_sponsors_display_window_valid',
      sql`${table.startAt} IS NULL OR ${table.endAt} IS NULL OR ${table.startAt} <= ${table.endAt}`,
    ),
  }),
);

export type TournamentSponsor = typeof tournamentSponsors.$inferSelect;
export type NewTournamentSponsor = typeof tournamentSponsors.$inferInsert;
