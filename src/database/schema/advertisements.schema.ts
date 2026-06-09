import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const advertisements = pgTable(
  'advertisements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    imageUrl: text('image_url').notNull(),
    targetUrl: text('target_url').notNull(),
    placementSlot: varchar('placement_slot', { length: 100 }).notNull(),
    viewsCount: integer('views_count').default(0).notNull(),
    clicksCount: integer('clicks_count').default(0).notNull(),
    startDate: timestamp('start_date', { withTimezone: true }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    adsDateValid: check(
      'ads_date_valid',
      sql`${table.startDate} < ${table.endDate}`,
    ),
  }),
);
