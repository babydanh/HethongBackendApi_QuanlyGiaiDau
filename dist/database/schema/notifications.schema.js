"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchReactions = exports.matchMutedUsers = exports.matchComments = exports.notifications = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_schema_1 = require("./users.schema");
const matches_schema_1 = require("./matches.schema");
exports.notifications = (0, pg_core_1.pgTable)('notifications', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    receiverId: (0, pg_core_1.uuid)('receiver_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    senderId: (0, pg_core_1.uuid)('sender_id').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    type: (0, pg_core_1.varchar)('type', { length: 100 }).notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    content: (0, pg_core_1.text)('content').notNull(),
    redirectUrl: (0, pg_core_1.text)('redirect_url'),
    isRead: (0, pg_core_1.boolean)('is_read').default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    idxNotificationsReceiverRead: (0, pg_core_1.index)('idx_notifications_receiver_read').on(table.receiverId, table.isRead),
}));
exports.matchComments = (0, pg_core_1.pgTable)('match_comments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    matchId: (0, pg_core_1.uuid)('match_id')
        .references(() => matches_schema_1.matches.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    commentText: (0, pg_core_1.text)('comment_text').notNull(),
    parentId: (0, pg_core_1.uuid)('parent_id'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.matchMutedUsers = (0, pg_core_1.pgTable)('match_muted_users', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    matchId: (0, pg_core_1.uuid)('match_id')
        .references(() => matches_schema_1.matches.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    mutedBy: (0, pg_core_1.uuid)('muted_by')
        .references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    reason: (0, pg_core_1.text)('reason'),
    type: (0, pg_core_1.varchar)('type', { length: 20 }).default('MUTE').notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.matchReactions = (0, pg_core_1.pgTable)('match_reactions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    matchId: (0, pg_core_1.uuid)('match_id')
        .references(() => matches_schema_1.matches.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).default('LIKE').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
//# sourceMappingURL=notifications.schema.js.map