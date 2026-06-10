import {
  pgTable,
  uuid,
  integer,
  timestamp,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { communities } from './communities.schema';
import { categories } from './categories.schema';

export const communityRankings = pgTable('community_rankings', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id').references(() => communities.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }).notNull(),
  eloPoints: integer('elo_points').default(1000).notNull(),
  matchesPlayed: integer('matches_played').default(0).notNull(),
  matchesWon: integer('matches_won').default(0).notNull(),
  winStreak: integer('win_streak').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  communityUserCategoryUnique: unique('community_user_category_unique').on(table.communityId, table.userId, table.categoryId),
  communityEloNonNegative: check('community_elo_non_negative', sql`${table.eloPoints} >= 0`),
}));
