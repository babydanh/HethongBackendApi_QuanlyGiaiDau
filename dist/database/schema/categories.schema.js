"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pairRanks = exports.eloHistoryLogs = exports.userRanks = exports.eloTiers = exports.categories = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_schema_1 = require("./users.schema");
const communities_schema_1 = require("./communities.schema");
exports.categories = (0, pg_core_1.pgTable)('categories', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull().unique(),
    slug: (0, pg_core_1.varchar)('slug', { length: 255 }).notNull().unique(),
    description: (0, pg_core_1.text)('description'),
    categoryConfig: (0, pg_core_1.jsonb)('category_config').default('{}').notNull(),
});
exports.eloTiers = (0, pg_core_1.pgTable)('elo_tiers', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    categoryId: (0, pg_core_1.uuid)('category_id')
        .references(() => exports.categories.id, { onDelete: 'cascade' })
        .notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    minElo: (0, pg_core_1.integer)('min_elo').notNull(),
    maxElo: (0, pg_core_1.integer)('max_elo').notNull(),
    iconUrl: (0, pg_core_1.text)('icon_url'),
}, (table) => ({
    eloRangeValid: (0, pg_core_1.check)('elo_range_valid', (0, drizzle_orm_1.sql) `${table.minElo} < ${table.maxElo}`),
}));
exports.userRanks = (0, pg_core_1.pgTable)('user_ranks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    categoryId: (0, pg_core_1.uuid)('category_id')
        .references(() => exports.categories.id, { onDelete: 'cascade' })
        .notNull(),
    communityId: (0, pg_core_1.uuid)('community_id')
        .references(() => communities_schema_1.communities.id, { onDelete: 'cascade' }),
    matchType: (0, pg_core_1.varchar)('match_type', { length: 50 }).notNull(),
    genderRestriction: (0, pg_core_1.varchar)('gender_restriction', { length: 20 }),
    eloPoints: (0, pg_core_1.integer)('elo_points').default(1000).notNull(),
    tierId: (0, pg_core_1.uuid)('tier_id').references(() => exports.eloTiers.id, {
        onDelete: 'set null',
    }),
    shieldActive: (0, pg_core_1.boolean)('shield_active').default(false).notNull(),
    matchesPlayed: (0, pg_core_1.integer)('matches_played').default(0).notNull(),
    matchesWon: (0, pg_core_1.integer)('matches_won').default(0).notNull(),
    winStreak: (0, pg_core_1.integer)('win_streak').default(0).notNull(),
    peakElo: (0, pg_core_1.integer)('peak_elo').default(1000).notNull(),
    lastActiveAt: (0, pg_core_1.timestamp)('last_active_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    lastDecayAt: (0, pg_core_1.timestamp)('last_decay_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    eloNonNegative: (0, pg_core_1.check)('elo_non_negative', (0, drizzle_orm_1.sql) `${table.eloPoints} >= 0`),
    winsLtePlayed: (0, pg_core_1.check)('wins_lte_played', (0, drizzle_orm_1.sql) `${table.matchesWon} <= ${table.matchesPlayed}`),
    userCategoryRankNullGenderIdx: (0, pg_core_1.uniqueIndex)('user_category_rank_null_gender_idx')
        .on(table.userId, table.categoryId, table.matchType, table.communityId)
        .where((0, drizzle_orm_1.sql) `${table.genderRestriction} IS NULL`),
    userCategoryRankWithGenderIdx: (0, pg_core_1.uniqueIndex)('user_category_rank_with_gender_idx')
        .on(table.userId, table.categoryId, table.matchType, table.genderRestriction, table.communityId)
        .where((0, drizzle_orm_1.sql) `${table.genderRestriction} IS NOT NULL`),
}));
exports.eloHistoryLogs = (0, pg_core_1.pgTable)('elo_history_logs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    categoryId: (0, pg_core_1.uuid)('category_id')
        .references(() => exports.categories.id, { onDelete: 'cascade' })
        .notNull(),
    matchId: (0, pg_core_1.uuid)('match_id'),
    tournamentId: (0, pg_core_1.uuid)('tournament_id'),
    reason: (0, pg_core_1.varchar)('reason', { length: 100 }),
    previousElo: (0, pg_core_1.integer)('previous_elo').notNull(),
    newElo: (0, pg_core_1.integer)('new_elo').notNull(),
    changedPoints: (0, pg_core_1.integer)('changed_points').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    uniqueIdxMatchUser: (0, pg_core_1.uniqueIndex)('unique_idx_match_user')
        .on(table.matchId, table.userId)
        .where((0, drizzle_orm_1.sql) `${table.matchId} IS NOT NULL`),
}));
exports.pairRanks = (0, pg_core_1.pgTable)('pair_ranks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    user1Id: (0, pg_core_1.uuid)('user1_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    user2Id: (0, pg_core_1.uuid)('user2_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    categoryId: (0, pg_core_1.uuid)('category_id').references(() => exports.categories.id, { onDelete: 'cascade' }).notNull(),
    matchType: (0, pg_core_1.varchar)('match_type', { length: 50 }).default('DOUBLES').notNull(),
    genderRestriction: (0, pg_core_1.varchar)('gender_restriction', { length: 20 }),
    scope: (0, pg_core_1.varchar)('scope', { length: 20 }).default('PUBLIC').notNull(),
    communityId: (0, pg_core_1.uuid)('community_id').references(() => communities_schema_1.communities.id, { onDelete: 'cascade' }),
    eloPoints: (0, pg_core_1.integer)('elo_points').default(1000).notNull(),
    peakElo: (0, pg_core_1.integer)('peak_elo').default(1000).notNull(),
    lastActiveAt: (0, pg_core_1.timestamp)('last_active_at', { withTimezone: true }).defaultNow().notNull(),
    lastDecayAt: (0, pg_core_1.timestamp)('last_decay_at', { withTimezone: true }).defaultNow().notNull(),
    matchesPlayed: (0, pg_core_1.integer)('matches_played').default(0).notNull(),
    matchesWon: (0, pg_core_1.integer)('matches_won').default(0).notNull(),
    winStreak: (0, pg_core_1.integer)('win_streak').default(0).notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    userPairUnique: (0, pg_core_1.uniqueIndex)('user_pair_rank_context_idx').on(table.user1Id, table.user2Id, table.categoryId, table.matchType, table.scope, (0, drizzle_orm_1.sql) `COALESCE(${table.genderRestriction}, '')`, (0, drizzle_orm_1.sql) `COALESCE(${table.communityId}::text, '')`),
}));
//# sourceMappingURL=categories.schema.js.map