"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wards = exports.provinces = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.provinces = (0, pg_core_1.pgTable)('provinces', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    code: (0, pg_core_1.varchar)('code', { length: 20 }).notNull().unique(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    nameEn: (0, pg_core_1.varchar)('name_en', { length: 255 }),
    fullName: (0, pg_core_1.varchar)('full_name', { length: 255 }),
    fullNameEn: (0, pg_core_1.varchar)('full_name_en', { length: 255 }),
    codeName: (0, pg_core_1.varchar)('code_name', { length: 255 }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.wards = (0, pg_core_1.pgTable)('wards', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    code: (0, pg_core_1.varchar)('code', { length: 20 }).notNull().unique(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    nameEn: (0, pg_core_1.varchar)('name_en', { length: 255 }),
    fullName: (0, pg_core_1.varchar)('full_name', { length: 255 }),
    fullNameEn: (0, pg_core_1.varchar)('full_name_en', { length: 255 }),
    codeName: (0, pg_core_1.varchar)('code_name', { length: 255 }),
    provinceCode: (0, pg_core_1.varchar)('province_code', { length: 20 })
        .references(() => exports.provinces.code, { onDelete: 'cascade' })
        .notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
//# sourceMappingURL=regions.schema.js.map