"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tournamentFollows = exports.tournamentStaff = exports.tournamentReferees = exports.tournamentRosters = exports.tournamentParticipants = exports.tournamentGroups = exports.tournamentStages = exports.tournaments = exports.parentTournaments = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_schema_1 = require("./users.schema");
const communities_schema_1 = require("./communities.schema");
const categories_schema_1 = require("./categories.schema");
const venues_schema_1 = require("./venues.schema");
const tournament_divisions_schema_1 = require("./tournament_divisions.schema");
exports.parentTournaments = (0, pg_core_1.pgTable)('parent_tournaments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    bannerUrl: (0, pg_core_1.text)('banner_url'),
    logoUrl: (0, pg_core_1.text)('logo_url'),
    sports: (0, pg_core_1.jsonb)('sports').$type().default([]).notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
});
exports.tournaments = (0, pg_core_1.pgTable)('tournaments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    parentId: (0, pg_core_1.uuid)('parent_id').references(() => exports.parentTournaments.id, {
        onDelete: 'cascade',
    }),
    communityId: (0, pg_core_1.uuid)('community_id').references(() => communities_schema_1.communities.id, {
        onDelete: 'set null',
    }),
    categoryId: (0, pg_core_1.uuid)('category_id')
        .references(() => categories_schema_1.categories.id)
        .notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('DRAFT').notNull(),
    matchType: (0, pg_core_1.varchar)('match_type', { length: 50 }).default('DOUBLES').notNull(),
    sportRules: (0, pg_core_1.jsonb)('sport_rules').notNull(),
    tournamentConfig: (0, pg_core_1.jsonb)('tournament_config').notNull(),
    entryFee: (0, pg_core_1.numeric)('entry_fee', { precision: 12, scale: 2 })
        .default('0.00')
        .notNull(),
    platformFeePercentage: (0, pg_core_1.numeric)('platform_fee_percentage', {
        precision: 5,
        scale: 2,
    })
        .default('5.00')
        .notNull(),
    registrationStartDate: (0, pg_core_1.timestamp)('registration_start_date', { withTimezone: true }),
    registrationEndDate: (0, pg_core_1.timestamp)('registration_end_date', { withTimezone: true }),
    maxParticipants: (0, pg_core_1.integer)('max_participants'),
    startDate: (0, pg_core_1.timestamp)('start_date', { withTimezone: true }),
    endDate: (0, pg_core_1.timestamp)('end_date', { withTimezone: true }),
    venueId: (0, pg_core_1.uuid)('venue_id').references(() => venues_schema_1.tournamentVenues.id, {
        onDelete: 'set null',
    }),
    tournamentType: (0, pg_core_1.varchar)('tournament_type', { length: 50 }).default('CLUB').notNull(),
    bannerUrl: (0, pg_core_1.text)('banner_url'),
    logoUrl: (0, pg_core_1.text)('logo_url'),
    galleryImages: (0, pg_core_1.text)('gallery_images')
        .array()
        .default((0, drizzle_orm_1.sql) `'{}'::text[]`)
        .notNull(),
    prizeDescription: (0, pg_core_1.text)('prize_description'),
    prizes: (0, pg_core_1.jsonb)('prizes').default((0, drizzle_orm_1.sql) `'[]'::jsonb`),
    inviteCode: (0, pg_core_1.varchar)('invite_code', { length: 20 }).unique(),
    visibility: (0, pg_core_1.varchar)('visibility', { length: 50 }).default('PUBLIC').notNull(),
    genderRestriction: (0, pg_core_1.varchar)('gender_restriction', { length: 20 }),
    contactInfo: (0, pg_core_1.jsonb)('contact_info'),
    city: (0, pg_core_1.varchar)('city', { length: 100 }),
    reservedSlotsCount: (0, pg_core_1.integer)('reserved_slots_count').default(0).notNull(),
    isRanked: (0, pg_core_1.boolean)('is_ranked').default(true).notNull(),
    isRegistrationLocked: (0, pg_core_1.boolean)('is_registration_locked').default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    archivedAt: (0, pg_core_1.timestamp)('archived_at', { withTimezone: true }),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
}, (table) => ({
    entryFeeNonNegative: (0, pg_core_1.check)('entry_fee_non_negative', (0, drizzle_orm_1.sql) `${table.entryFee} >= 0`),
    platformFeeValid: (0, pg_core_1.check)('platform_fee_valid', (0, drizzle_orm_1.sql) `${table.platformFeePercentage} >= 0 AND ${table.platformFeePercentage} <= 100`),
    idxTournamentsStatusVisibility: (0, pg_core_1.index)('idx_tournaments_status_visibility').on(table.status, table.visibility),
    idxTournamentsCreatedBy: (0, pg_core_1.index)('idx_tournaments_created_by').on(table.createdBy),
}));
exports.tournamentStages = (0, pg_core_1.pgTable)('tournament_stages', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id')
        .references(() => exports.tournaments.id, { onDelete: 'cascade' })
        .notNull(),
    tournamentDivisionId: (0, pg_core_1.uuid)('tournament_division_id').references(() => tournament_divisions_schema_1.tournamentDivisions.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(),
    order: (0, pg_core_1.integer)('order').notNull(),
    roundConfig: (0, pg_core_1.jsonb)('round_config'),
    venueId: (0, pg_core_1.uuid)('venue_id').references(() => venues_schema_1.tournamentVenues.id, { onDelete: 'set null' }),
    scheduledDate: (0, pg_core_1.date)('scheduled_date'),
    notificationNote: (0, pg_core_1.text)('notification_note'),
    matchSettings: (0, pg_core_1.jsonb)('match_settings'),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
}, (table) => ({
    idxStagesTournamentDivision: (0, pg_core_1.index)('idx_stages_tournament_division').on(table.tournamentId, table.tournamentDivisionId),
}));
exports.tournamentGroups = (0, pg_core_1.pgTable)('tournament_groups', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    stageId: (0, pg_core_1.uuid)('stage_id')
        .references(() => exports.tournamentStages.id, { onDelete: 'cascade' })
        .notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    roundConfig: (0, pg_core_1.jsonb)('round_config'),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
}, (table) => ({
    idxGroupsStageId: (0, pg_core_1.index)('idx_groups_stage_id').on(table.stageId),
}));
exports.tournamentParticipants = (0, pg_core_1.pgTable)('tournament_participants', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id')
        .references(() => exports.tournaments.id, { onDelete: 'cascade' })
        .notNull(),
    tournamentDivisionId: (0, pg_core_1.uuid)('tournament_division_id').references(() => tournament_divisions_schema_1.tournamentDivisions.id, { onDelete: 'cascade' }),
    groupId: (0, pg_core_1.uuid)('group_id').references(() => exports.tournamentGroups.id, {
        onDelete: 'set null',
    }),
    registeredBy: (0, pg_core_1.uuid)('registered_by')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    teamName: (0, pg_core_1.varchar)('team_name', { length: 255 }).notNull(),
    footballTeamId: (0, pg_core_1.uuid)('football_team_id'),
    footballTeamLogoUrl: (0, pg_core_1.varchar)('football_team_logo_url', { length: 1000 }),
    seed: (0, pg_core_1.integer)('seed'),
    points: (0, pg_core_1.integer)('points').default(0).notNull(),
    rankingConsent: (0, pg_core_1.boolean)('ranking_consent').default(false).notNull(),
    customResponses: (0, pg_core_1.jsonb)('custom_responses'),
    isPaid: (0, pg_core_1.boolean)('is_paid').default(false).notNull(),
    teamInviteToken: (0, pg_core_1.varchar)('team_invite_token', { length: 50 }).unique(),
    teamStatus: (0, pg_core_1.varchar)('team_status', { length: 50 }).default('PENDING').notNull(),
    partnerUserId: (0, pg_core_1.uuid)('partner_user_id').references(() => users_schema_1.users.id, { onDelete: 'restrict' }),
    partnerInviteExpiresAt: (0, pg_core_1.timestamp)('partner_invite_expires_at', { withTimezone: true }),
    isMock: (0, pg_core_1.boolean)('is_mock').default(false).notNull(),
    isWildcard: (0, pg_core_1.boolean)('is_wildcard').default(false).notNull(),
    registeredAt: (0, pg_core_1.timestamp)('registered_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    rosterLockedAt: (0, pg_core_1.timestamp)('roster_locked_at', { withTimezone: true }),
}, (table) => ({
    idxParticipantsTournamentStatus: (0, pg_core_1.index)('idx_participants_tournament_status').on(table.tournamentId, table.teamStatus),
    idxParticipantsTournamentId: (0, pg_core_1.index)('idx_participants_tournament_id').on(table.tournamentId),
}));
exports.tournamentRosters = (0, pg_core_1.pgTable)('tournament_rosters', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    participantId: (0, pg_core_1.uuid)('participant_id')
        .references(() => exports.tournamentParticipants.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    role: (0, pg_core_1.varchar)('role', { length: 50 }).default('MAIN').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('ACTIVE').notNull(),
    joinedAt: (0, pg_core_1.timestamp)('joined_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    idxRostersParticipantUserUnique: (0, pg_core_1.uniqueIndex)('tournament_rosters_participant_user_unique_idx').on(table.participantId, table.userId),
}));
exports.tournamentReferees = (0, pg_core_1.pgTable)('tournament_referees', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id').references(() => exports.tournaments.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'restrict' }).notNull(),
    assignedBy: (0, pg_core_1.uuid)('assigned_by').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('INVITED').notNull(),
    assignedAt: (0, pg_core_1.timestamp)('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
exports.tournamentStaff = (0, pg_core_1.pgTable)('tournament_staff', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id')
        .references(() => exports.tournaments.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    role: (0, pg_core_1.varchar)('role', { length: 50 }).notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
exports.tournamentFollows = (0, pg_core_1.pgTable)('tournament_follows', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id')
        .references(() => exports.tournaments.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    uniqueFollow: (0, pg_core_1.uniqueIndex)('tournament_follows_unique_idx').on(table.tournamentId, table.userId),
}));
//# sourceMappingURL=tournaments.schema.js.map