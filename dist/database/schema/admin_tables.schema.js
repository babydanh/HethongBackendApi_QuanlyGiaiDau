"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reportActions = exports.reports = exports.systemConfigs = exports.userBans = exports.verificationTickets = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_schema_1 = require("./users.schema");
exports.verificationTickets = (0, pg_core_1.pgTable)('verification_tickets', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    evidenceUrls: (0, pg_core_1.text)('evidence_urls').array().notNull(),
    contactPhone: (0, pg_core_1.varchar)('contact_phone', { length: 20 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('PENDING').notNull(),
    rejectReason: (0, pg_core_1.text)('reject_reason'),
    reviewedBy: (0, pg_core_1.uuid)('reviewed_by').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.userBans = (0, pg_core_1.pgTable)('user_bans', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    bannedBy: (0, pg_core_1.uuid)('banned_by')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    reason: (0, pg_core_1.text)('reason').notNull(),
    banType: (0, pg_core_1.varchar)('ban_type', { length: 50 }).default('SOFT_BAN').notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
});
exports.systemConfigs = (0, pg_core_1.pgTable)('system_configs', {
    key: (0, pg_core_1.varchar)('key', { length: 100 }).primaryKey(),
    value: (0, pg_core_1.text)('value').notNull(),
    description: (0, pg_core_1.text)('description'),
    updatedBy: (0, pg_core_1.uuid)('updated_by')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
const drizzle_orm_1 = require("drizzle-orm");
exports.reports = (0, pg_core_1.pgTable)('reports', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    reporterId: (0, pg_core_1.uuid)('reporter_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    targetType: (0, pg_core_1.varchar)('target_type', { length: 50 }).notNull(),
    targetId: (0, pg_core_1.uuid)('target_id').notNull(),
    source: (0, pg_core_1.varchar)('source', { length: 50 }).default('USER_REPORT').notNull(),
    sourceReferenceId: (0, pg_core_1.uuid)('source_reference_id'),
    category: (0, pg_core_1.varchar)('category', { length: 50 }).default('OTHER').notNull(),
    reason: (0, pg_core_1.text)('reason').notNull(),
    evidenceUrls: (0, pg_core_1.text)('evidence_urls')
        .array()
        .default((0, drizzle_orm_1.sql) `'{}'::text[]`)
        .notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 })
        .default('SUBMITTED')
        .notNull(),
    assignedTo: (0, pg_core_1.uuid)('assigned_to').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    resolvedBy: (0, pg_core_1.uuid)('resolved_by').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    resolutionNote: (0, pg_core_1.text)('resolution_note'),
    triagedAt: (0, pg_core_1.timestamp)('triaged_at', { withTimezone: true }),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    targetTypeCheck: (0, pg_core_1.check)('reports_target_type_check', (0, drizzle_orm_1.sql) `${table.targetType} in ('USER', 'TOURNAMENT', 'MATCH', 'COMMUNITY')`),
    sourceCheck: (0, pg_core_1.check)('reports_source_check', (0, drizzle_orm_1.sql) `${table.source} in ('USER_REPORT', 'LEGACY_DISPUTE')`),
    categoryCheck: (0, pg_core_1.check)('reports_category_check', (0, drizzle_orm_1.sql) `${table.category} in ('CHEATING', 'RULE_VIOLATION', 'ABUSIVE_BEHAVIOR', 'FAKE_INFORMATION', 'PAYMENT_FRAUD', 'UNSAFE_ORGANIZATION', 'OTHER')`),
    statusCheck: (0, pg_core_1.check)('reports_status_check', (0, drizzle_orm_1.sql) `${table.status} in ('SUBMITTED', 'TRIAGED', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'REJECTED')`),
    queueIndex: (0, pg_core_1.index)('reports_queue_idx').on(table.status, table.targetType, table.category, table.createdAt),
    reporterIndex: (0, pg_core_1.index)('reports_reporter_idx').on(table.reporterId, table.createdAt),
    uniqueOpenReport: (0, pg_core_1.uniqueIndex)('reports_unique_open_idx')
        .on(table.reporterId, table.targetType, table.targetId, table.category)
        .where((0, drizzle_orm_1.sql) `${table.status} not in ('RESOLVED', 'REJECTED')`),
    uniqueSourceReference: (0, pg_core_1.uniqueIndex)('reports_source_reference_unique_idx')
        .on(table.source, table.sourceReferenceId)
        .where((0, drizzle_orm_1.sql) `${table.sourceReferenceId} is not null`),
    sourceReferenceIndex: (0, pg_core_1.index)('reports_source_reference_idx').on(table.sourceReferenceId),
}));
exports.reportActions = (0, pg_core_1.pgTable)('report_actions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    reportId: (0, pg_core_1.uuid)('report_id')
        .references(() => exports.reports.id, { onDelete: 'cascade' })
        .notNull(),
    actorId: (0, pg_core_1.uuid)('actor_id').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    action: (0, pg_core_1.varchar)('action', { length: 50 }).notNull(),
    fromStatus: (0, pg_core_1.varchar)('from_status', { length: 50 }),
    toStatus: (0, pg_core_1.varchar)('to_status', { length: 50 }).notNull(),
    note: (0, pg_core_1.text)('note'),
    metadata: (0, pg_core_1.jsonb)('metadata').$type(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    reportTimelineIndex: (0, pg_core_1.index)('report_actions_timeline_idx').on(table.reportId, table.createdAt),
}));
//# sourceMappingURL=admin_tables.schema.js.map