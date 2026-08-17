import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  integer,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { provinces } from './regions.schema';
import { tournaments } from './tournaments.schema';


export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  isEmailVerified: boolean('is_email_verified').default(false).notNull(),
  isPhoneVerified: boolean('is_phone_verified').default(false).notNull(),
  isMock: boolean('is_mock').default(false).notNull(),
  acceptedTosAt: timestamp('accepted_tos_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const authProviders = pgTable('auth_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  providerEmail: varchar('provider_email', { length: 255 }),
  providerAvatarUrl: text('provider_avatar_url'),
  providerDisplayName: varchar('provider_display_name', { length: 255 }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => ({
  providerUserUnique: unique().on(table.provider, table.providerUserId),
}));

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userToRoles = pgTable('user_to_roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  roleId: uuid('role_id')
    .references(() => roles.id, { onDelete: 'cascade' })
    .notNull(),
  assignedAt: timestamp('assigned_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  assignedBy: uuid('assigned_by').references(() => users.id, {
    onDelete: 'set null',
  }),
}, (table) => ({
  userRoleUnique: uniqueIndex('user_to_roles_user_id_role_id_unique').on(
    table.userId,
    table.roleId,
  ),
}));

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  coverUrl: text('cover_url'),
  phoneNumber: varchar('phone_number', { length: 20 }),
  dateOfBirth: date('date_of_birth'),
  gender: varchar('gender', { length: 20 }),
  isGenderLocked: boolean('is_gender_locked').default(false).notNull(),
  address: text('address'),
  bio: text('bio'),
  provinceCode: varchar('province_code', { length: 20 })
    .references(() => provinces.code, { onDelete: 'set null' }),
  isVerified: boolean('is_verified').default(false).notNull(),
  // Quyền riêng tư nhắn tin: false = chặn người lạ (không cùng CLB, không bạn bè) nhắn tin.
  allowStrangerMessages: boolean('allow_stranger_messages').default(true).notNull(),
  bankName: varchar('bank_name', { length: 100 }),
  bankAccountNumber: varchar('bank_account_number', { length: 50 }),
  bankAccountName: varchar('bank_account_name', { length: 255 }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  refreshToken: text('refresh_token').notNull().unique(),
  userAgent: text('user_agent'),
  ipAddress: varchar('ip_address', { length: 45 }),
  isRevoked: boolean('is_revoked').default(false).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const organizerReviews = pgTable('organizer_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizerId: uuid('organizer_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  reviewerId: uuid('reviewer_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  tournamentId: uuid('tournament_id').references(() => tournaments.id, { onDelete: 'cascade' }).notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userChangeRequests = pgTable('user_change_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  requestType: varchar('request_type', { length: 50 }).notNull(), // 'GENDER', 'EMAIL'
  oldValue: text('old_value').notNull(),
  newValue: text('new_value').notNull(),
  status: varchar('status', { length: 50 }).default('PENDING').notNull(), // 'PENDING', 'APPROVED', 'REJECTED'
  adminNote: text('admin_note'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

