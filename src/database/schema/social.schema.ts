import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';

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

export const chatRooms = pgTable('chat_rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }),
  type: varchar('type', { length: 50 }).default('DIRECT').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
