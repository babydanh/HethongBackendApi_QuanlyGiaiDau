"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.otpCodes = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_schema_1 = require("./users.schema");
exports.otpCodes = (0, pg_core_1.pgTable)('otp_codes', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    type: (0, pg_core_1.varchar)('type', { length: 20 }).notNull(),
    code: (0, pg_core_1.varchar)('code', { length: 255 }).notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }).notNull(),
    isUsed: (0, pg_core_1.boolean)('is_used').default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
//# sourceMappingURL=otp_codes.schema.js.map