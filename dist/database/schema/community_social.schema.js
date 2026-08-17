"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.communityPollVotes = exports.communityPollOptions = exports.communityPolls = exports.communityMemberSocialPreferences = exports.communitySocialReports = exports.communityPostReactions = exports.communityPostComments = exports.communityPosts = exports.communitySocialSettings = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const communities_schema_1 = require("./communities.schema");
const users_schema_1 = require("./users.schema");
const tournaments_schema_1 = require("./tournaments.schema");
exports.communitySocialSettings = (0, pg_core_1.pgTable)('community_social_settings', {
    communityId: (0, pg_core_1.uuid)('community_id')
        .primaryKey()
        .references(() => communities_schema_1.communities.id, { onDelete: 'cascade' }),
    postingPolicy: (0, pg_core_1.varchar)('posting_policy', { length: 30 }).default('MEMBERS').notNull(),
    postApprovalRequired: (0, pg_core_1.boolean)('post_approval_required').default(false).notNull(),
    commentsEnabled: (0, pg_core_1.boolean)('comments_enabled').default(true).notNull(),
    chatEnabled: (0, pg_core_1.boolean)('chat_enabled').default(true).notNull(),
    publicFeed: (0, pg_core_1.boolean)('public_feed').default(true).notNull(),
    memberTaggingPolicy: (0, pg_core_1.varchar)('member_tagging_policy', { length: 30 }).default('MEMBERS').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
exports.communityPosts = (0, pg_core_1.pgTable)('community_posts', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    communityId: (0, pg_core_1.uuid)('community_id')
        .references(() => communities_schema_1.communities.id, { onDelete: 'cascade' })
        .notNull(),
    authorId: (0, pg_core_1.uuid)('author_id').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    tournamentId: (0, pg_core_1.uuid)('tournament_id').references(() => tournaments_schema_1.tournaments.id, { onDelete: 'cascade' }),
    type: (0, pg_core_1.varchar)('type', { length: 30 }).default('NORMAL').notNull(),
    body: (0, pg_core_1.text)('body'),
    mediaUrls: (0, pg_core_1.text)('media_urls').array().default((0, drizzle_orm_1.sql) `'{}'::text[]`).notNull(),
    topics: (0, pg_core_1.text)('topics').array().default((0, drizzle_orm_1.sql) `'{}'::text[]`).notNull(),
    mentions: (0, pg_core_1.jsonb)('mentions').$type().default((0, drizzle_orm_1.sql) `'[]'::jsonb`).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('PUBLISHED').notNull(),
    idempotencyKey: (0, pg_core_1.varchar)('idempotency_key', { length: 128 }),
    reactionCount: (0, pg_core_1.integer)('reaction_count').default(0).notNull(),
    commentCount: (0, pg_core_1.integer)('comment_count').default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
}, (table) => ({
    feedIndex: (0, pg_core_1.index)('idx_community_posts_feed').on(table.communityId, table.createdAt, table.id),
    statusIndex: (0, pg_core_1.index)('idx_community_posts_status').on(table.communityId, table.status, table.createdAt),
    tournamentIndex: (0, pg_core_1.index)('idx_community_posts_tournament').on(table.tournamentId),
    idempotencyUnique: (0, pg_core_1.uniqueIndex)('uq_community_posts_idempotency')
        .on(table.communityId, table.authorId, table.idempotencyKey)
        .where((0, drizzle_orm_1.sql) `${table.idempotencyKey} IS NOT NULL`),
}));
exports.communityPostComments = (0, pg_core_1.pgTable)('community_post_comments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    postId: (0, pg_core_1.uuid)('post_id').references(() => exports.communityPosts.id, { onDelete: 'cascade' }).notNull(),
    authorId: (0, pg_core_1.uuid)('author_id').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    parentId: (0, pg_core_1.uuid)('parent_id'),
    body: (0, pg_core_1.text)('body').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('PUBLISHED').notNull(),
    moderationReason: (0, pg_core_1.text)('moderation_reason'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
}, (table) => ({
    postIndex: (0, pg_core_1.index)('idx_community_post_comments_post').on(table.postId, table.createdAt, table.id),
}));
exports.communityPostReactions = (0, pg_core_1.pgTable)('community_post_reactions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    postId: (0, pg_core_1.uuid)('post_id').references(() => exports.communityPosts.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    reactionType: (0, pg_core_1.varchar)('reaction_type', { length: 24 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    uniqueReaction: (0, pg_core_1.uniqueIndex)('uq_community_post_reactions_user').on(table.postId, table.userId),
}));
exports.communitySocialReports = (0, pg_core_1.pgTable)('community_social_reports', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    communityId: (0, pg_core_1.uuid)('community_id').references(() => communities_schema_1.communities.id, { onDelete: 'cascade' }).notNull(),
    reporterId: (0, pg_core_1.uuid)('reporter_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    postId: (0, pg_core_1.uuid)('post_id').references(() => exports.communityPosts.id, { onDelete: 'cascade' }),
    commentId: (0, pg_core_1.uuid)('comment_id').references(() => exports.communityPostComments.id, { onDelete: 'cascade' }),
    reason: (0, pg_core_1.varchar)('reason', { length: 60 }).notNull(),
    details: (0, pg_core_1.text)('details'),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('OPEN').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
}, (table) => ({
    queueIndex: (0, pg_core_1.index)('idx_community_social_reports_queue').on(table.communityId, table.status, table.createdAt),
}));
exports.communityMemberSocialPreferences = (0, pg_core_1.pgTable)('community_member_social_preferences', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    communityId: (0, pg_core_1.uuid)('community_id').references(() => communities_schema_1.communities.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    muted: (0, pg_core_1.boolean)('muted').default(false).notNull(),
    notificationsEnabled: (0, pg_core_1.boolean)('notifications_enabled').default(true).notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    uniqueMemberPreference: (0, pg_core_1.uniqueIndex)('uq_community_member_social_preferences').on(table.communityId, table.userId),
}));
exports.communityPolls = (0, pg_core_1.pgTable)('community_polls', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    communityId: (0, pg_core_1.uuid)('community_id').references(() => communities_schema_1.communities.id, { onDelete: 'cascade' }).notNull(),
    postId: (0, pg_core_1.uuid)('post_id').references(() => exports.communityPosts.id, { onDelete: 'cascade' }),
    creatorId: (0, pg_core_1.uuid)('creator_id').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    question: (0, pg_core_1.text)('question').notNull(),
    allowMultipleAnswers: (0, pg_core_1.boolean)('allow_multiple_answers').default(false).notNull(),
    allowAddOptions: (0, pg_core_1.boolean)('allow_add_options').default(true).notNull(),
    isClosed: (0, pg_core_1.boolean)('is_closed').default(false).notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    postPollIndex: (0, pg_core_1.index)('idx_community_polls_post').on(table.postId),
    communityPollIndex: (0, pg_core_1.index)('idx_community_polls_community').on(table.communityId),
}));
exports.communityPollOptions = (0, pg_core_1.pgTable)('community_poll_options', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    pollId: (0, pg_core_1.uuid)('poll_id').references(() => exports.communityPolls.id, { onDelete: 'cascade' }).notNull(),
    creatorId: (0, pg_core_1.uuid)('creator_id').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    optionText: (0, pg_core_1.text)('option_text').notNull(),
    voteCount: (0, pg_core_1.integer)('vote_count').default(0).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    pollOptionIndex: (0, pg_core_1.index)('idx_community_poll_options_poll').on(table.pollId),
}));
exports.communityPollVotes = (0, pg_core_1.pgTable)('community_poll_votes', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    pollId: (0, pg_core_1.uuid)('poll_id').references(() => exports.communityPolls.id, { onDelete: 'cascade' }).notNull(),
    optionId: (0, pg_core_1.uuid)('option_id').references(() => exports.communityPollOptions.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    uniqueVote: (0, pg_core_1.uniqueIndex)('uq_community_poll_votes_user_option').on(table.optionId, table.userId),
    pollVoteIndex: (0, pg_core_1.index)('idx_community_poll_votes_poll').on(table.pollId, table.userId),
}));
//# sourceMappingURL=community_social.schema.js.map