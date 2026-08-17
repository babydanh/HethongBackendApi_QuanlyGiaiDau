"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.advertisements = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
exports.advertisements = (0, pg_core_1.pgTable)('advertisements', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    title: (0, pg_core_1.varchar)('title', { length: 255 }).notNull(),
    imageUrl: (0, pg_core_1.text)('image_url').notNull(),
    targetUrl: (0, pg_core_1.text)('target_url').notNull(),
    placementSlot: (0, pg_core_1.varchar)('placement_slot', { length: 100 }).notNull(),
    viewsCount: (0, pg_core_1.integer)('views_count').default(0).notNull(),
    clicksCount: (0, pg_core_1.integer)('clicks_count').default(0).notNull(),
    startDate: (0, pg_core_1.timestamp)('start_date', { withTimezone: true }).notNull(),
    endDate: (0, pg_core_1.timestamp)('end_date', { withTimezone: true }).notNull(),
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    adsDateValid: (0, pg_core_1.check)('ads_date_valid', (0, drizzle_orm_1.sql) `${table.startDate} < ${table.endDate}`),
}));
//# sourceMappingURL=advertisements.schema.js.map