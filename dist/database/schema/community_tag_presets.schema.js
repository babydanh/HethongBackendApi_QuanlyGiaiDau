"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.communityTagPresets = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const communities_schema_1 = require("./communities.schema");
const users_schema_1 = require("./users.schema");
exports.communityTagPresets = (0, pg_core_1.pgTable)('community_tag_presets', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    communityId: (0, pg_core_1.uuid)('community_id').references(() => communities_schema_1.communities.id, { onDelete: 'cascade' }).notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 24 }).notNull(),
    color: (0, pg_core_1.varchar)('color', { length: 7 }).notNull().default('#E2E8F0'),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    communityNameUnique: (0, pg_core_1.uniqueIndex)('community_tag_presets_name_unique').on(table.communityId, (0, drizzle_orm_1.sql) `lower(${table.name})`),
}));
//# sourceMappingURL=community_tag_presets.schema.js.map