import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  check,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { communities } from './communities.schema';

export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderId: uuid('sender_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    receiverId: uuid('receiver_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: varchar('status', { length: 50 }).default('PENDING').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    noSelfFriend: check(
      'no_self_friend',
      sql`${table.senderId} != ${table.receiverId}`,
    ),
  }),
);

export const chatRooms = pgTable(
  'chat_rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }),
    type: varchar('type', { length: 50 }).default('DIRECT').notNull(),
    // P2D.1: Club Chat — communityId nullable, unique khi type=CLUB; clubName/clubAvatar denormalized (snapshot lúc tạo room).
    communityId: uuid('community_id').references(() => communities.id, {
      onDelete: 'cascade',
    }),
    clubName: varchar('club_name', { length: 255 }),
    clubAvatar: text('club_avatar'),
    isAnnouncementOnly: boolean('is_announcement_only').default(false).notNull(),
    slowModeSeconds: integer('slow_mode_seconds').default(0).notNull(),
    pinnedMessageId: uuid('pinned_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    clubRoomUnique: uniqueIndex('uq_chat_rooms_club_community')
      .on(table.communityId)
      .where(sql`${table.type} = 'CLUB'`),
  }),
);

export const chatRoomMembers = pgTable('chat_room_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id')
    .references(() => chatRooms.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id')
    .references(() => chatRooms.id, { onDelete: 'cascade' })
    .notNull(),
  senderId: uuid('sender_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  messageText: text('message_text'),
  attachmentsUrls: text('attachments_urls')
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  clientMessageId: varchar('client_message_id', { length: 128 }),
  isRead: boolean('is_read').default(false).notNull(),
  isRevoked: boolean('is_revoked').default(false).notNull(),
  revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replyToId: uuid('reply_to_id'),
  isPinned: boolean('is_pinned').default(false).notNull(),
  pinnedBy: uuid('pinned_by').references(() => users.id, { onDelete: 'set null' }),
  pinnedAt: timestamp('pinned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => ({
  roomCreatedIdx: index('idx_chat_messages_room_created').on(table.roomId, table.createdAt),
  pinnedIdx: index('idx_chat_messages_pinned').on(table.roomId, table.isPinned),
}));

export const chatMessageReactions = pgTable('chat_message_reactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').references(() => chatMessages.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  emoji: varchar('emoji', { length: 16 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  msgUserEmojiUnique: uniqueIndex('uq_chat_msg_reaction_user').on(table.messageId, table.userId, table.emoji),
  messageIdx: index('idx_chat_msg_reactions_msg').on(table.messageId),
}));

export const chatReadStates = pgTable('chat_read_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').references(() => chatRooms.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  roomUserUnique: uniqueIndex('uq_chat_read_states_room_user').on(table.roomId, table.userId),
}));

/** User-level chat block. A block is symmetric for access checks, but the
 * blocker is retained so the owner can later revoke it without ambiguity. */
export const chatBlocks = pgTable('chat_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockerId: uuid('blocker_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  blockedId: uuid('blocked_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pairUnique: uniqueIndex('uq_chat_blocks_pair').on(table.blockerId, table.blockedId),
  noSelfBlock: check('chat_blocks_no_self', sql`${table.blockerId} <> ${table.blockedId}`),
}));
