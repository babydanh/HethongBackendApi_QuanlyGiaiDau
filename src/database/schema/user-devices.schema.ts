import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const userDeviceTokens = pgTable(
  'user_device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    token: text('token').notNull(),
    platform: varchar('platform', { length: 20 }).default('ANDROID').notNull(), // ANDROID | IOS | WEB
    deviceInfo: text('device_info'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    idxUserDeviceUserId: index('idx_user_device_user_id').on(table.userId),
    idxUserDeviceToken: uniqueIndex('idx_user_device_user_token').on(
      table.userId,
      table.token,
    ),
  }),
);

export type UserDeviceToken = typeof userDeviceTokens.$inferSelect;
export type NewUserDeviceToken = typeof userDeviceTokens.$inferInsert;
