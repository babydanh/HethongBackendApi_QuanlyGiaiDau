import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  check,
  uniqueIndex,
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
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const chatReadStates = pgTable('chat_read_states', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').references(() => chatRooms.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  roomUserUnique: uniqueIndex('uq_chat_read_states_room_user').on(table.roomId, table.userId),
}));
