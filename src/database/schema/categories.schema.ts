import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  boolean,
  timestamp,
  check,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { communities } from './communities.schema';

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  categoryConfig: jsonb('category_config').default('{}').notNull(),
});

export const eloTiers = pgTable(
  'elo_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    minElo: integer('min_elo').notNull(),
    maxElo: integer('max_elo').notNull(),
    iconUrl: text('icon_url'),
  },
  (table) => ({
    eloRangeValid: check(
      'elo_range_valid',
      sql`${table.minElo} < ${table.maxElo}`,
    ),
  }),
);

export const userRanks = pgTable(
  'user_ranks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'cascade' })
      .notNull(),
    communityId: uuid('community_id')
      .references(() => communities.id, { onDelete: 'cascade' }),
    matchType: varchar('match_type', { length: 50 }).notNull(),
    genderRestriction: varchar('gender_restriction', { length: 20 }),
    eloPoints: integer('elo_points').default(1000).notNull(),
    tierId: uuid('tier_id').references(() => eloTiers.id, {
      onDelete: 'set null',
    }),
    shieldActive: boolean('shield_active').default(false).notNull(),
    matchesPlayed: integer('matches_played').default(0).notNull(),
    matchesWon: integer('matches_won').default(0).notNull(),
    winStreak: integer('win_streak').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    eloNonNegative: check('elo_non_negative', sql`${table.eloPoints} >= 0`),
    winsLtePlayed: check(
      'wins_lte_played',
      sql`${table.matchesWon} <= ${table.matchesPlayed}`,
    ),
    userCategoryRankNullGenderIdx: uniqueIndex('user_category_rank_null_gender_idx')
      .on(table.userId, table.categoryId, table.matchType, table.communityId)
      .where(sql`${table.genderRestriction} IS NULL`),
    userCategoryRankWithGenderIdx: uniqueIndex('user_category_rank_with_gender_idx')
      .on(table.userId, table.categoryId, table.matchType, table.genderRestriction, table.communityId)
      .where(sql`${table.genderRestriction} IS NOT NULL`),
  }),
);

export const eloHistoryLogs = pgTable('elo_history_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  categoryId: uuid('category_id')
    .references(() => categories.id, { onDelete: 'cascade' })
    .notNull(),
  matchId: uuid('match_id'), // fk will be added via ALTER TABLE later or manually due to circular deps
  reason: varchar('reason', { length: 100 }),
  previousElo: integer('previous_elo').notNull(),
  newElo: integer('new_elo').notNull(),
  changedPoints: integer('changed_points').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const pairRanks = pgTable(
  'pair_ranks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user1Id: uuid('user1_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    user2Id: uuid('user2_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
    matchType: varchar('match_type', { length: 50 }).default('DOUBLES').notNull(),
    genderRestriction: varchar('gender_restriction', { length: 20 }),
    scope: varchar('scope', { length: 20 }).default('PUBLIC').notNull(),
    communityId: uuid('community_id').references(() => communities.id, { onDelete: 'cascade' }),
    eloPoints: integer('elo_points').default(1000).notNull(),
    matchesPlayed: integer('matches_played').default(0).notNull(),
    matchesWon: integer('matches_won').default(0).notNull(),
    winStreak: integer('win_streak').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userPairUnique: uniqueIndex('user_pair_rank_context_idx').on(
      table.user1Id,
      table.user2Id,
      table.categoryId,
      table.matchType,
      table.scope,
      sql`COALESCE(${table.genderRestriction}, '')`,
      sql`COALESCE(${table.communityId}::text, '')`,
    ),
  })
);
