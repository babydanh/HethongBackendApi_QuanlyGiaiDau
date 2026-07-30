import {
  pgTable,
  uuid,
  integer,
  timestamp,
  varchar,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { communities } from './communities.schema';
import { categories, eloTiers } from './categories.schema';

export const communityRankings = pgTable('community_rankings', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id').references(() => communities.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
  matchType: varchar('match_type', { length: 50 }).default('SINGLES').notNull(),
  genderRestriction: varchar('gender_restriction', { length: 20 }),
  eloPoints: integer('elo_points').default(1000).notNull(),
  matchesPlayed: integer('matches_played').default(0).notNull(),
  matchesWon: integer('matches_won').default(0).notNull(),
  winStreak: integer('win_streak').default(0).notNull(),
  peakElo: integer('peak_elo').default(1000).notNull(),
  tierId: uuid('tier_id').references(() => eloTiers.id, {
    onDelete: 'set null',
  }),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  communityRankNullGenderIdx: uniqueIndex('community_rank_null_gender_idx')
    .on(table.communityId, table.userId, table.categoryId, table.matchType)
    .where(sql`${table.genderRestriction} IS NULL`),
  communityRankWithGenderIdx: uniqueIndex('community_rank_with_gender_idx')
    .on(table.communityId, table.userId, table.categoryId, table.matchType, table.genderRestriction)
    .where(sql`${table.genderRestriction} IS NOT NULL`),
  communityEloNonNegative: check('community_elo_non_negative', sql`${table.eloPoints} >= 0`),
}));
