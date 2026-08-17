"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.communityRankings = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_schema_1 = require("./users.schema");
const communities_schema_1 = require("./communities.schema");
const categories_schema_1 = require("./categories.schema");
exports.communityRankings = (0, pg_core_1.pgTable)('community_rankings', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    communityId: (0, pg_core_1.uuid)('community_id').references(() => communities_schema_1.communities.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: (0, pg_core_1.uuid)('category_id').references(() => categories_schema_1.categories.id, { onDelete: 'cascade' }).notNull(),
    matchType: (0, pg_core_1.varchar)('match_type', { length: 50 }).default('SINGLES').notNull(),
    genderRestriction: (0, pg_core_1.varchar)('gender_restriction', { length: 20 }),
    eloPoints: (0, pg_core_1.integer)('elo_points').default(1000).notNull(),
    matchesPlayed: (0, pg_core_1.integer)('matches_played').default(0).notNull(),
    matchesWon: (0, pg_core_1.integer)('matches_won').default(0).notNull(),
    winStreak: (0, pg_core_1.integer)('win_streak').default(0).notNull(),
    peakElo: (0, pg_core_1.integer)('peak_elo').default(1000).notNull(),
    lastActiveAt: (0, pg_core_1.timestamp)('last_active_at', { withTimezone: true }).defaultNow().notNull(),
    lastDecayAt: (0, pg_core_1.timestamp)('last_decay_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    communityRankNullGenderIdx: (0, pg_core_1.uniqueIndex)('community_rank_null_gender_idx')
        .on(table.communityId, table.userId, table.categoryId, table.matchType)
        .where((0, drizzle_orm_1.sql) `${table.genderRestriction} IS NULL`),
    communityRankWithGenderIdx: (0, pg_core_1.uniqueIndex)('community_rank_with_gender_idx')
        .on(table.communityId, table.userId, table.categoryId, table.matchType, table.genderRestriction)
        .where((0, drizzle_orm_1.sql) `${table.genderRestriction} IS NOT NULL`),
    communityEloNonNegative: (0, pg_core_1.check)('community_elo_non_negative', (0, drizzle_orm_1.sql) `${table.eloPoints} >= 0`),
}));
//# sourceMappingURL=community_rankings.schema.js.map