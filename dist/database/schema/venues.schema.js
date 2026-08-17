"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.venueCourts = exports.tournamentVenues = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const geography = (0, pg_core_1.customType)({
    dataType() {
        return 'geography(Point, 4326)';
    },
});
exports.tournamentVenues = (0, pg_core_1.pgTable)('tournament_venues', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    locationAddress: (0, pg_core_1.text)('location_address').notNull(),
    locationGeolocation: geography('location_geolocation'),
    imagesUrls: (0, pg_core_1.text)('images_urls')
        .array()
        .default((0, drizzle_orm_1.sql) `'{}'::text[]`)
        .notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
});
exports.venueCourts = (0, pg_core_1.pgTable)('venue_courts', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    venueId: (0, pg_core_1.uuid)('venue_id')
        .references(() => exports.tournamentVenues.id, { onDelete: 'cascade' })
        .notNull(),
    courtName: (0, pg_core_1.varchar)('court_name', { length: 100 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('AVAILABLE').notNull(),
});
//# sourceMappingURL=venues.schema.js.map