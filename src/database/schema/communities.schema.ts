import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  customType,
  jsonb,
  integer,
  unique
} from 'drizzle-orm/pg-core';

const geography = customType<{ data: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});
import { users } from './users.schema';
import { categories } from './categories.schema';
import { provinces, districts, wards } from './regions.schema';
import { tournaments } from './tournaments.schema';

export const communities = pgTable('communities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  logoUrl: text('logo_url'),
  bannerUrl: text('banner_url'),
  creatorId: uuid('creator_id')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  provinceCode: varchar('province_code', { length: 20 })
    .references(() => provinces.code),
  districtCode: varchar('district_code', { length: 20 })
    .references(() => districts.code),
  wardCode: varchar('ward_code', { length: 20 })
    .references(() => wards.code),
  visibility: varchar('visibility', { length: 50 }).default('PUBLIC').notNull(),
  joinMode: varchar('join_mode', { length: 50 }).default('OPEN').notNull(),
  joinQuestions: jsonb('join_questions').$type<string[]>().default([]).notNull(),
  rules: text('rules'),
  maxMembers: integer('max_members'),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(),
  approvedBy: uuid('approved_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  rejectedReason: text('rejected_reason'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  // Using custom type for PostGIS
  locationGeolocation: geography('location_geolocation'),
  locationAddress: text('location_address'),
  socialLinks: jsonb('social_links').$type<{
    facebook?: string;
    zalo?: string;
    website?: string;
  }>(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const communitySports = pgTable('community_sports', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id')
    .references(() => communities.id, { onDelete: 'cascade' })
    .notNull(),
  categoryId: uuid('category_id')
    .references(() => categories.id, { onDelete: 'cascade' })
    .notNull(),
});

export const communityMembers = pgTable('community_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id')
    .references(() => communities.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  role: varchar('role', { length: 50 }).default('MEMBER').notNull(),
  status: varchar('status', { length: 50 }).default('JOINED').notNull(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  joinAnswers: jsonb('join_answers').$type<Record<string, string>>(),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  joinedAt: timestamp('joined_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const communityFollows = pgTable('community_follows', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id')
    .references(() => communities.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueFollow: unique('unique_community_follow').on(table.communityId, table.userId, table.type),
}));

export const communityChallenges = pgTable('community_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  challengerId: uuid('challenger_id')
    .references(() => communities.id, { onDelete: 'cascade' })
    .notNull(),
  challengedId: uuid('challenged_id')
    .references(() => communities.id, { onDelete: 'cascade' })
    .notNull(),
  senderUserId: uuid('sender_user_id')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(),
  message: text('message'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  tournamentId: uuid('tournament_id').references(() => tournaments.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
