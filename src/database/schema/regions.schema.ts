import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

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

export const districts = pgTable('districts', {
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
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const wards = pgTable('wards', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  nameEn: varchar('name_en', { length: 255 }),
  fullName: varchar('full_name', { length: 255 }),
  fullNameEn: varchar('full_name_en', { length: 255 }),
  codeName: varchar('code_name', { length: 255 }),
  districtCode: varchar('district_code', { length: 20 })
    .references(() => districts.code, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
