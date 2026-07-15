import { pgTable, uuid, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  type: varchar('type', { length: 20 }).notNull(), // 'EMAIL_VERIFY' | 'PHONE_VERIFY' | 'PASSWORD_RESET'
  code: varchar('code', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  isUsed: boolean('is_used').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});
