"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogs = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_schema_1 = require("./users.schema");
exports.auditLogs = (0, pg_core_1.pgTable)('audit_logs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    action: (0, pg_core_1.varchar)('action', { length: 100 }).notNull(),
    tableName: (0, pg_core_1.varchar)('table_name', { length: 100 }).notNull(),
    recordId: (0, pg_core_1.uuid)('record_id').notNull(),
    oldValues: (0, pg_core_1.jsonb)('old_values'),
    newValues: (0, pg_core_1.jsonb)('new_values'),
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 45 }),
    userAgent: (0, pg_core_1.text)('user_agent'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
//# sourceMappingURL=audit.schema.js.map