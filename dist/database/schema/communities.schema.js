"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.communityChallenges = exports.communityFollows = exports.communityMembers = exports.communitySports = exports.communities = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const geography = (0, pg_core_1.customType)({
    dataType() {
        return 'geography(Point, 4326)';
    },
});
const users_schema_1 = require("./users.schema");
const categories_schema_1 = require("./categories.schema");
const regions_schema_1 = require("./regions.schema");
const tournaments_schema_1 = require("./tournaments.schema");
exports.communities = (0, pg_core_1.pgTable)('communities', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    logoUrl: (0, pg_core_1.text)('logo_url'),
    bannerUrl: (0, pg_core_1.text)('banner_url'),
    creatorId: (0, pg_core_1.uuid)('creator_id')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    provinceCode: (0, pg_core_1.varchar)('province_code', { length: 20 })
        .references(() => regions_schema_1.provinces.code),
    districtCode: (0, pg_core_1.varchar)('district_code', { length: 20 }),
    wardCode: (0, pg_core_1.varchar)('ward_code', { length: 20 })
        .references(() => regions_schema_1.wards.code),
    visibility: (0, pg_core_1.varchar)('visibility', { length: 50 }).default('PUBLIC').notNull(),
    joinMode: (0, pg_core_1.varchar)('join_mode', { length: 50 }).default('OPEN').notNull(),
    joinQuestions: (0, pg_core_1.jsonb)('join_questions').$type().default([]).notNull(),
    rules: (0, pg_core_1.text)('rules'),
    maxMembers: (0, pg_core_1.integer)('max_members'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('ACTIVE').notNull(),
    approvedBy: (0, pg_core_1.uuid)('approved_by').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    rejectedReason: (0, pg_core_1.text)('rejected_reason'),
    reviewedAt: (0, pg_core_1.timestamp)('reviewed_at', { withTimezone: true }),
    locationGeolocation: geography('location_geolocation'),
    locationAddress: (0, pg_core_1.text)('location_address'),
    socialLinks: (0, pg_core_1.jsonb)('social_links').$type(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
});
exports.communitySports = (0, pg_core_1.pgTable)('community_sports', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    communityId: (0, pg_core_1.uuid)('community_id')
        .references(() => exports.communities.id, { onDelete: 'cascade' })
        .notNull(),
    categoryId: (0, pg_core_1.uuid)('category_id')
        .references(() => categories_schema_1.categories.id, { onDelete: 'cascade' })
        .notNull(),
}, (table) => ({
    oneSportPerCommunity: (0, pg_core_1.unique)('community_sports_community_id_unique').on(table.communityId),
}));
exports.communityMembers = (0, pg_core_1.pgTable)('community_members', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    communityId: (0, pg_core_1.uuid)('community_id')
        .references(() => exports.communities.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    role: (0, pg_core_1.varchar)('role', { length: 50 }).default('MEMBER').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('JOINED').notNull(),
    invitedBy: (0, pg_core_1.uuid)('invited_by').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    joinAnswers: (0, pg_core_1.jsonb)('join_answers').$type(),
    tags: (0, pg_core_1.text)('tags')
        .array()
        .default((0, drizzle_orm_1.sql) `'{}'::text[]`)
        .notNull(),
    notificationPreference: (0, pg_core_1.varchar)('notification_preference', { length: 32 })
        .default('ALL')
        .notNull(),
    approvedBy: (0, pg_core_1.uuid)('approved_by').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    approvedAt: (0, pg_core_1.timestamp)('approved_at', { withTimezone: true }),
    joinedAt: (0, pg_core_1.timestamp)('joined_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.communityFollows = (0, pg_core_1.pgTable)('community_follows', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    communityId: (0, pg_core_1.uuid)('community_id')
        .references(() => exports.communities.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    uniqueFollow: (0, pg_core_1.unique)('unique_community_follow').on(table.communityId, table.userId, table.type),
}));
exports.communityChallenges = (0, pg_core_1.pgTable)('community_challenges', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    challengerId: (0, pg_core_1.uuid)('challenger_id')
        .references(() => exports.communities.id, { onDelete: 'cascade' })
        .notNull(),
    challengedId: (0, pg_core_1.uuid)('challenged_id')
        .references(() => exports.communities.id, { onDelete: 'cascade' })
        .notNull(),
    senderUserId: (0, pg_core_1.uuid)('sender_user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('PENDING').notNull(),
    message: (0, pg_core_1.text)('message'),
    scheduledAt: (0, pg_core_1.timestamp)('scheduled_at', { withTimezone: true }),
    tournamentId: (0, pg_core_1.uuid)('tournament_id').references(() => tournaments_schema_1.tournaments.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
//# sourceMappingURL=communities.schema.js.map