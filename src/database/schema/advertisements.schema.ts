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
    description: text('description'),
    bannerType: varchar('banner_type', { length: 50 }).default('IMAGE_LINK').notNull(),
    imageUrl: text('image_url'),
    targetUrl: text('target_url'),
    ctaText: varchar('cta_text', { length: 100 }),
    customHtml: text('custom_html'),
    placementSlot: varchar('placement_slot', { length: 100 }).notNull(),
    displayOrder: integer('display_order').default(0).notNull(),
    viewsCount: integer('views_count').default(0).notNull(),
    clicksCount: integer('clicks_count').default(0).notNull(),
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    adsDateValid: check(
      'ads_date_valid',
      sql`${table.startDate} IS NULL OR ${table.endDate} IS NULL OR ${table.startDate} < ${table.endDate}`,
    ),
  }),
);

export type Advertisement = typeof advertisements.$inferSelect;
export type NewAdvertisement = typeof advertisements.$inferInsert;
