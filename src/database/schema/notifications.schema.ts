import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { matches } from './matches.schema';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  receiverId: uuid('receiver_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  senderId: uuid('sender_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  type: varchar('type', { length: 100 }).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  redirectUrl: text('redirect_url'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const matchComments = pgTable('match_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id')
    .references(() => matches.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  commentText: text('comment_text').notNull(),
  parentId: uuid('parent_id'), // fk added below
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const matchMutedUsers = pgTable('match_muted_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id')
    .references(() => matches.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  mutedBy: uuid('muted_by')
    .references(() => users.id, { onDelete: 'set null' }),
  reason: text('reason'),
  type: varchar('type', { length: 20 }).default('MUTE').notNull(), // MUTE | BAN
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const matchReactions = pgTable('match_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id')
    .references(() => matches.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  type: varchar('type', { length: 50 }).default('LIKE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
