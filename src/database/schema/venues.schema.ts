import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  customType,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const geography = customType<{ data: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

export const tournamentVenues = pgTable('tournament_venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  locationAddress: text('location_address').notNull(),
  locationGeolocation: geography('location_geolocation'),
  imagesUrls: text('images_urls')
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const venueCourts = pgTable('venue_courts', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id')
    .references(() => tournamentVenues.id, { onDelete: 'cascade' })
    .notNull(),
  courtName: varchar('court_name', { length: 100 }).notNull(),
  status: varchar('status', { length: 50 }).default('AVAILABLE').notNull(),
});
