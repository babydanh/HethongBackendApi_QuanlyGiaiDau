import { pgTable, uuid, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities.schema';
import { users } from './users.schema';

export const communityTagPresets = pgTable('community_tag_presets', {
  id: uuid('id').primaryKey().defaultRandom(),
  communityId: uuid('community_id').references(() => communities.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 24 }).notNull(),
  color: varchar('color', { length: 7 }).notNull().default('#E2E8F0'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  communityNameUnique: uniqueIndex('community_tag_presets_name_unique').on(table.communityId, sql`lower(${table.name})`),
}));
