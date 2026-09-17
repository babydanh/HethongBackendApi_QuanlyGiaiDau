import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  customType,
  integer,
  date,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';

const geography = customType<{ data: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

export const tournamentVenues = pgTable('tournament_venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerUserId: uuid('owner_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
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

export const venuePricingRules = pgTable(
  'venue_pricing_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .references(() => tournamentVenues.id, { onDelete: 'cascade' })
      .notNull(),
    courtId: uuid('court_id').references(() => venueCourts.id, {
      onDelete: 'cascade',
    }),
    dayOfWeek: integer('day_of_week').notNull(), // 0 = Chủ Nhật, 1 = T2, ..., 6 = T7, -1 = Tất cả các ngày
    startTime: varchar('start_time', { length: 8 }).notNull(), // vd: "06:00"
    endTime: varchar('end_time', { length: 8 }).notNull(), // vd: "17:00"
    pricePerHour: integer('price_per_hour').notNull(), // VND / giờ
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    venueIdx: index('venue_pricing_rules_venue_idx').on(table.venueId),
  }),
);

export const courtBookings = pgTable(
  'court_bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .references(() => tournamentVenues.id, { onDelete: 'cascade' })
      .notNull(),
    courtId: uuid('court_id')
      .references(() => venueCourts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    bookingDate: date('booking_date').notNull(),
    startTime: varchar('start_time', { length: 8 }).notNull(), // vd: "18:00"
    endTime: varchar('end_time', { length: 8 }).notNull(), // vd: "20:00"
    status: varchar('status', { length: 30 }).default('CONFIRMED').notNull(), // PENDING, CONFIRMED, CANCELLED, COMPLETED
    totalPrice: integer('total_price').default(0).notNull(),
    depositAmount: integer('deposit_amount').default(0).notNull(),
    paymentStatus: varchar('payment_status', { length: 30 })
      .default('UNPAID')
      .notNull(), // UNPAID, PARTIAL, PAID, REFUNDED
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    courtDateIdx: index('court_bookings_court_date_idx').on(
      table.courtId,
      table.bookingDate,
      table.status,
    ),
    userBookingIdx: index('court_bookings_user_idx').on(
      table.userId,
      table.createdAt,
    ),
    statusCheck: check(
      'court_bookings_status_check',
      sql`${table.status} IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED')`,
    ),
  }),
);
