"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatBlocks = exports.chatReadStates = exports.chatMessageReactions = exports.chatMessages = exports.chatRoomMembers = exports.chatRooms = exports.friendships = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_schema_1 = require("./users.schema");
const communities_schema_1 = require("./communities.schema");
exports.friendships = (0, pg_core_1.pgTable)('friendships', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    senderId: (0, pg_core_1.uuid)('sender_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    receiverId: (0, pg_core_1.uuid)('receiver_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('PENDING').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    noSelfFriend: (0, pg_core_1.check)('no_self_friend', (0, drizzle_orm_1.sql) `${table.senderId} != ${table.receiverId}`),
}));
exports.chatRooms = (0, pg_core_1.pgTable)('chat_rooms', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).default('DIRECT').notNull(),
    communityId: (0, pg_core_1.uuid)('community_id').references(() => communities_schema_1.communities.id, {
        onDelete: 'cascade',
    }),
    clubName: (0, pg_core_1.varchar)('club_name', { length: 255 }),
    clubAvatar: (0, pg_core_1.text)('club_avatar'),
    isAnnouncementOnly: (0, pg_core_1.boolean)('is_announcement_only').default(false).notNull(),
    slowModeSeconds: (0, pg_core_1.integer)('slow_mode_seconds').default(0).notNull(),
    pinnedMessageId: (0, pg_core_1.uuid)('pinned_message_id'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    clubRoomUnique: (0, pg_core_1.uniqueIndex)('uq_chat_rooms_club_community')
        .on(table.communityId)
        .where((0, drizzle_orm_1.sql) `${table.type} = 'CLUB'`),
}));
exports.chatRoomMembers = (0, pg_core_1.pgTable)('chat_room_members', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    roomId: (0, pg_core_1.uuid)('room_id')
        .references(() => exports.chatRooms.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    joinedAt: (0, pg_core_1.timestamp)('joined_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    clearedAt: (0, pg_core_1.timestamp)('cleared_at', { withTimezone: true }),
});
exports.chatMessages = (0, pg_core_1.pgTable)('chat_messages', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    roomId: (0, pg_core_1.uuid)('room_id')
        .references(() => exports.chatRooms.id, { onDelete: 'cascade' })
        .notNull(),
    senderId: (0, pg_core_1.uuid)('sender_id').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    messageText: (0, pg_core_1.text)('message_text'),
    attachmentsUrls: (0, pg_core_1.text)('attachments_urls')
        .array()
        .default((0, drizzle_orm_1.sql) `'{}'::text[]`)
        .notNull(),
    type: (0, pg_core_1.varchar)('type', { length: 32 }).default('TEXT').notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata'),
    clientMessageId: (0, pg_core_1.varchar)('client_message_id', { length: 128 }),
    isRead: (0, pg_core_1.boolean)('is_read').default(false).notNull(),
    isRevoked: (0, pg_core_1.boolean)('is_revoked').default(false).notNull(),
    revokedBy: (0, pg_core_1.uuid)('revoked_by').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    revokedAt: (0, pg_core_1.timestamp)('revoked_at', { withTimezone: true }),
    replyToId: (0, pg_core_1.uuid)('reply_to_id'),
    isPinned: (0, pg_core_1.boolean)('is_pinned').default(false).notNull(),
    pinnedBy: (0, pg_core_1.uuid)('pinned_by').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    pinnedAt: (0, pg_core_1.timestamp)('pinned_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    roomCreatedIdx: (0, pg_core_1.index)('idx_chat_messages_room_created').on(table.roomId, table.createdAt),
    pinnedIdx: (0, pg_core_1.index)('idx_chat_messages_pinned').on(table.roomId, table.isPinned),
}));
exports.chatMessageReactions = (0, pg_core_1.pgTable)('chat_message_reactions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    messageId: (0, pg_core_1.uuid)('message_id').references(() => exports.chatMessages.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    emoji: (0, pg_core_1.varchar)('emoji', { length: 16 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    msgUserEmojiUnique: (0, pg_core_1.uniqueIndex)('uq_chat_msg_reaction_user').on(table.messageId, table.userId, table.emoji),
    messageIdx: (0, pg_core_1.index)('idx_chat_msg_reactions_msg').on(table.messageId),
}));
exports.chatReadStates = (0, pg_core_1.pgTable)('chat_read_states', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    roomId: (0, pg_core_1.uuid)('room_id').references(() => exports.chatRooms.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    lastReadAt: (0, pg_core_1.timestamp)('last_read_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    roomUserUnique: (0, pg_core_1.uniqueIndex)('uq_chat_read_states_room_user').on(table.roomId, table.userId),
}));
exports.chatBlocks = (0, pg_core_1.pgTable)('chat_blocks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    blockerId: (0, pg_core_1.uuid)('blocker_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    blockedId: (0, pg_core_1.uuid)('blocked_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    pairUnique: (0, pg_core_1.uniqueIndex)('uq_chat_blocks_pair').on(table.blockerId, table.blockedId),
    noSelfBlock: (0, pg_core_1.check)('chat_blocks_no_self', (0, drizzle_orm_1.sql) `${table.blockerId} <> ${table.blockedId}`),
}));
//# sourceMappingURL=social.schema.js.map