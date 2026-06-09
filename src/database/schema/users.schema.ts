import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  date,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  isEmailVerified: boolean('is_email_verified').default(false).notNull(),
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
});

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
});

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  phoneNumber: varchar('phone_number', { length: 20 }),
  dateOfBirth: date('date_of_birth'),
  gender: varchar('gender', { length: 20 }),
  address: text('address'),
  bio: text('bio'),
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
