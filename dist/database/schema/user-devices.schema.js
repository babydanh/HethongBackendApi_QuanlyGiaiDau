"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userDeviceTokens = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_schema_1 = require("./users.schema");
exports.userDeviceTokens = (0, pg_core_1.pgTable)('user_device_tokens', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    token: (0, pg_core_1.text)('token').notNull(),
    platform: (0, pg_core_1.varchar)('platform', { length: 20 }).default('ANDROID').notNull(),
    deviceInfo: (0, pg_core_1.text)('device_info'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    idxUserDeviceUserId: (0, pg_core_1.index)('idx_user_device_user_id').on(table.userId),
    idxUserDeviceToken: (0, pg_core_1.uniqueIndex)('idx_user_device_user_token').on(table.userId, table.token),
}));
//# sourceMappingURL=user-devices.schema.js.map