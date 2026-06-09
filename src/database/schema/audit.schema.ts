import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  tableName: varchar('table_name', { length: 100 }).notNull(),
  recordId: uuid('record_id').notNull(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
