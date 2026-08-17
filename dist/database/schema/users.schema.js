"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userChangeRequests = exports.organizerReviews = exports.sessions = exports.profiles = exports.userToRoles = exports.roles = exports.authProviders = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const regions_schema_1 = require("./regions.schema");
const tournaments_schema_1 = require("./tournaments.schema");
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    email: (0, pg_core_1.varchar)('email', { length: 255 }).notNull().unique(),
    passwordHash: (0, pg_core_1.text)('password_hash'),
    isEmailVerified: (0, pg_core_1.boolean)('is_email_verified').default(false).notNull(),
    isPhoneVerified: (0, pg_core_1.boolean)('is_phone_verified').default(false).notNull(),
    isMock: (0, pg_core_1.boolean)('is_mock').default(false).notNull(),
    acceptedTosAt: (0, pg_core_1.timestamp)('accepted_tos_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
});
exports.authProviders = (0, pg_core_1.pgTable)('auth_providers', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => exports.users.id, { onDelete: 'cascade' })
        .notNull(),
    provider: (0, pg_core_1.varchar)('provider', { length: 50 }).notNull(),
    providerUserId: (0, pg_core_1.varchar)('provider_user_id', { length: 255 }).notNull(),
    providerEmail: (0, pg_core_1.varchar)('provider_email', { length: 255 }),
    providerAvatarUrl: (0, pg_core_1.text)('provider_avatar_url'),
    providerDisplayName: (0, pg_core_1.varchar)('provider_display_name', { length: 255 }),
    accessToken: (0, pg_core_1.text)('access_token'),
    refreshToken: (0, pg_core_1.text)('refresh_token'),
    tokenExpiresAt: (0, pg_core_1.timestamp)('token_expires_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    providerUserUnique: (0, pg_core_1.unique)().on(table.provider, table.providerUserId),
}));
exports.roles = (0, pg_core_1.pgTable)('roles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull().unique(),
    slug: (0, pg_core_1.varchar)('slug', { length: 100 }).notNull().unique(),
    description: (0, pg_core_1.text)('description'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.userToRoles = (0, pg_core_1.pgTable)('user_to_roles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => exports.users.id, { onDelete: 'cascade' })
        .notNull(),
    roleId: (0, pg_core_1.uuid)('role_id')
        .references(() => exports.roles.id, { onDelete: 'cascade' })
        .notNull(),
    assignedAt: (0, pg_core_1.timestamp)('assigned_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    assignedBy: (0, pg_core_1.uuid)('assigned_by').references(() => exports.users.id, {
        onDelete: 'set null',
    }),
}, (table) => ({
    userRoleUnique: (0, pg_core_1.uniqueIndex)('user_to_roles_user_id_role_id_unique').on(table.userId, table.roleId),
}));
exports.profiles = (0, pg_core_1.pgTable)('profiles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => exports.users.id, { onDelete: 'cascade' })
        .notNull()
        .unique(),
    fullName: (0, pg_core_1.varchar)('full_name', { length: 255 }).notNull(),
    avatarUrl: (0, pg_core_1.text)('avatar_url'),
    coverUrl: (0, pg_core_1.text)('cover_url'),
    phoneNumber: (0, pg_core_1.varchar)('phone_number', { length: 20 }),
    dateOfBirth: (0, pg_core_1.date)('date_of_birth'),
    gender: (0, pg_core_1.varchar)('gender', { length: 20 }),
    isGenderLocked: (0, pg_core_1.boolean)('is_gender_locked').default(false).notNull(),
    address: (0, pg_core_1.text)('address'),
    bio: (0, pg_core_1.text)('bio'),
    provinceCode: (0, pg_core_1.varchar)('province_code', { length: 20 })
        .references(() => regions_schema_1.provinces.code, { onDelete: 'set null' }),
    isVerified: (0, pg_core_1.boolean)('is_verified').default(false).notNull(),
    allowStrangerMessages: (0, pg_core_1.boolean)('allow_stranger_messages').default(true).notNull(),
    bankName: (0, pg_core_1.varchar)('bank_name', { length: 100 }),
    bankAccountNumber: (0, pg_core_1.varchar)('bank_account_number', { length: 50 }),
    bankAccountName: (0, pg_core_1.varchar)('bank_account_name', { length: 255 }),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.sessions = (0, pg_core_1.pgTable)('sessions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => exports.users.id, { onDelete: 'cascade' })
        .notNull(),
    refreshToken: (0, pg_core_1.text)('refresh_token').notNull().unique(),
    userAgent: (0, pg_core_1.text)('user_agent'),
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 45 }),
    isRevoked: (0, pg_core_1.boolean)('is_revoked').default(false).notNull(),
    revokedAt: (0, pg_core_1.timestamp)('revoked_at', { withTimezone: true }),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
exports.organizerReviews = (0, pg_core_1.pgTable)('organizer_reviews', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    organizerId: (0, pg_core_1.uuid)('organizer_id').references(() => exports.users.id, { onDelete: 'cascade' }).notNull(),
    reviewerId: (0, pg_core_1.uuid)('reviewer_id').references(() => exports.users.id, { onDelete: 'restrict' }).notNull(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id').references(() => tournaments_schema_1.tournaments.id, { onDelete: 'cascade' }).notNull(),
    rating: (0, pg_core_1.integer)('rating').notNull(),
    comment: (0, pg_core_1.text)('comment'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
exports.userChangeRequests = (0, pg_core_1.pgTable)('user_change_requests', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => exports.users.id, { onDelete: 'cascade' })
        .notNull(),
    requestType: (0, pg_core_1.varchar)('request_type', { length: 50 }).notNull(),
    oldValue: (0, pg_core_1.text)('old_value').notNull(),
    newValue: (0, pg_core_1.text)('new_value').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('PENDING').notNull(),
    adminNote: (0, pg_core_1.text)('admin_note'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
});
//# sourceMappingURL=users.schema.js.map