import {
  customType,
  doublePrecision,
  index,
  pgTable,
  uuid,
  varchar,
  timestamp,
} from 'drizzle-orm/pg-core';

const geography = customType<{ data: string }>({
  dataType() {
    return 'geography(MultiPolygon, 4326)';
  },
});

export const provinces = pgTable('provinces', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  nameEn: varchar('name_en', { length: 255 }),
  fullName: varchar('full_name', { length: 255 }),
  fullNameEn: varchar('full_name_en', { length: 255 }),
  codeName: varchar('code_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const wards = pgTable(
  'wards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 20 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    nameEn: varchar('name_en', { length: 255 }),
    fullName: varchar('full_name', { length: 255 }),
    fullNameEn: varchar('full_name_en', { length: 255 }),
    codeName: varchar('code_name', { length: 255 }),
    provinceCode: varchar('province_code', { length: 20 })
      .references(() => provinces.code, { onDelete: 'cascade' })
      .notNull(),
    // Nullable authoritative polygon and nullable reference center. Resolve
    // assigns codes only through ST_Covers; a center never infers a region.
    boundary: geography('boundary'),
    centerLat: doublePrecision('center_lat'),
    centerLng: doublePrecision('center_lng'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    boundaryGistIdx: index('wards_boundary_gist_idx').using(
      'gist',
      table.boundary,
    ),
  }),
);
