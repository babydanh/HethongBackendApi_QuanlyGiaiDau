import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities.schema';
import { users } from './users.schema';
import { tournaments } from './tournaments.schema';

export const communitySocialSettings = pgTable('community_social_settings', {
  communityId: uuid('community_id')
    .primaryKey()
    .references(() => communities.id, { onDelete: 'cascade' }),
  postingPolicy: varchar('posting_policy', { length: 30 }).default('MEMBERS').notNull(),
  postApprovalRequired: boolean('post_approval_required').default(false).notNull(),
  commentsEnabled: boolean('comments_enabled').default(true).notNull(),
  chatEnabled: boolean('chat_enabled').default(true).notNull(),
  publicFeed: boolean('public_feed').default(true).notNull(),
  memberTaggingPolicy: varchar('member_tagging_policy', { length: 30 }).default('MEMBERS').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const communityPosts = pgTable('community_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id')
    .references(() => communities.id, { onDelete: 'cascade' })
    .notNull(),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  tournamentId: uuid('tournament_id').references(() => tournaments.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 30 }).default('NORMAL').notNull(),
  body: text('body'),
  mediaUrls: text('media_urls').array().default(sql`'{}'::text[]`).notNull(),
  topics: text('topics').array().default(sql`'{}'::text[]`).notNull(),
  mentions: jsonb('mentions').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  status: varchar('status', { length: 30 }).default('PUBLISHED').notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  reactionCount: integer('reaction_count').default(0).notNull(),
  commentCount: integer('comment_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  feedIndex: index('idx_community_posts_feed').on(table.communityId, table.createdAt, table.id),
  statusIndex: index('idx_community_posts_status').on(table.communityId, table.status, table.createdAt),
  tournamentIndex: index('idx_community_posts_tournament').on(table.tournamentId),
  idempotencyUnique: uniqueIndex('uq_community_posts_idempotency')
    .on(table.communityId, table.authorId, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} IS NOT NULL`),
}));

export const communityPostComments = pgTable('community_post_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => communityPosts.id, { onDelete: 'cascade' }).notNull(),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  parentId: uuid('parent_id'),
  body: text('body').notNull(),
  status: varchar('status', { length: 30 }).default('PUBLISHED').notNull(),
  moderationReason: text('moderation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  postIndex: index('idx_community_post_comments_post').on(table.postId, table.createdAt, table.id),
}));

export const communityPostReactions = pgTable('community_post_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id').references(() => communityPosts.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  reactionType: varchar('reaction_type', { length: 24 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueReaction: uniqueIndex('uq_community_post_reactions_user').on(table.postId, table.userId),
}));

export const communitySocialReports = pgTable('community_social_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id').references(() => communities.id, { onDelete: 'cascade' }).notNull(),
  reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  postId: uuid('post_id').references(() => communityPosts.id, { onDelete: 'cascade' }),
  commentId: uuid('comment_id').references(() => communityPostComments.id, { onDelete: 'cascade' }),
  reason: varchar('reason', { length: 60 }).notNull(),
  details: text('details'),
  status: varchar('status', { length: 30 }).default('OPEN').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (table) => ({
  queueIndex: index('idx_community_social_reports_queue').on(table.communityId, table.status, table.createdAt),
}));

export const communityMemberSocialPreferences = pgTable('community_member_social_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id').references(() => communities.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  muted: boolean('muted').default(false).notNull(),
  notificationsEnabled: boolean('notifications_enabled').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueMemberPreference: uniqueIndex('uq_community_member_social_preferences').on(table.communityId, table.userId),
}));

export const communityPolls = pgTable('community_polls', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id').references(() => communities.id, { onDelete: 'cascade' }).notNull(),
  postId: uuid('post_id').references(() => communityPosts.id, { onDelete: 'cascade' }),
  creatorId: uuid('creator_id').references(() => users.id, { onDelete: 'set null' }),
  question: text('question').notNull(),
  allowMultipleAnswers: boolean('allow_multiple_answers').default(false).notNull(),
  allowAddOptions: boolean('allow_add_options').default(true).notNull(),
  isClosed: boolean('is_closed').default(false).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  postPollIndex: index('idx_community_polls_post').on(table.postId),
  communityPollIndex: index('idx_community_polls_community').on(table.communityId),
}));

export const communityPollOptions = pgTable('community_poll_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  pollId: uuid('poll_id').references(() => communityPolls.id, { onDelete: 'cascade' }).notNull(),
  creatorId: uuid('creator_id').references(() => users.id, { onDelete: 'set null' }),
  optionText: text('option_text').notNull(),
  voteCount: integer('vote_count').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pollOptionIndex: index('idx_community_poll_options_poll').on(table.pollId),
}));

export const communityPollVotes = pgTable('community_poll_votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  pollId: uuid('poll_id').references(() => communityPolls.id, { onDelete: 'cascade' }).notNull(),
  optionId: uuid('option_id').references(() => communityPollOptions.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueVote: uniqueIndex('uq_community_poll_votes_user_option').on(table.optionId, table.userId),
  pollVoteIndex: index('idx_community_poll_votes_poll').on(table.pollId, table.userId),
}));

