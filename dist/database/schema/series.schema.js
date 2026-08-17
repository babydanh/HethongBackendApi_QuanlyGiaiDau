"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seriesManagers = exports.seriesInvitations = exports.psrPointLogs = exports.seriesStandings = exports.seriesEvents = exports.seriesLegs = exports.tournamentSeries = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_schema_1 = require("./users.schema");
const tournaments_schema_1 = require("./tournaments.schema");
const categories_schema_1 = require("./categories.schema");
exports.tournamentSeries = (0, pg_core_1.pgTable)('tournament_series', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    slug: (0, pg_core_1.varchar)('slug', { length: 255 }).notNull().unique(),
    description: (0, pg_core_1.text)('description'),
    bannerUrl: (0, pg_core_1.text)('banner_url'),
    logoUrl: (0, pg_core_1.text)('logo_url'),
    organizerId: (0, pg_core_1.uuid)('organizer_id')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('DRAFT').notNull(),
    startDate: (0, pg_core_1.timestamp)('start_date', { withTimezone: true }),
    endDate: (0, pg_core_1.timestamp)('end_date', { withTimezone: true }),
    totalPrize: (0, pg_core_1.numeric)('total_prize', { precision: 12, scale: 2 }),
    rules: (0, pg_core_1.jsonb)('rules').default((0, drizzle_orm_1.sql) `'{}'::jsonb`).notNull(),
    visibility: (0, pg_core_1.varchar)('visibility', { length: 50 }).default('PUBLIC').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
});
exports.seriesLegs = (0, pg_core_1.pgTable)('series_legs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    seriesId: (0, pg_core_1.uuid)('series_id')
        .references(() => exports.tournamentSeries.id, { onDelete: 'cascade' })
        .notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    order: (0, pg_core_1.integer)('order').notNull(),
    startDate: (0, pg_core_1.timestamp)('start_date', { withTimezone: true }),
    endDate: (0, pg_core_1.timestamp)('end_date', { withTimezone: true }),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('UPCOMING').notNull(),
    directEntrySlots: (0, pg_core_1.integer)('direct_entry_slots').default(2).notNull(),
    wildcardSlots: (0, pg_core_1.integer)('wildcard_slots').default(16).notNull(),
    rulesOverride: (0, pg_core_1.jsonb)('rules_override'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
exports.seriesEvents = (0, pg_core_1.pgTable)('series_events', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    legId: (0, pg_core_1.uuid)('leg_id')
        .references(() => exports.seriesLegs.id, { onDelete: 'cascade' })
        .notNull(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id')
        .references(() => tournaments_schema_1.tournaments.id, { onDelete: 'cascade' })
        .notNull()
        .unique(),
    region: (0, pg_core_1.varchar)('region', { length: 100 }),
    order: (0, pg_core_1.integer)('order').notNull(),
    pointMultiplier: (0, pg_core_1.real)('point_multiplier').default(1.0).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
exports.seriesStandings = (0, pg_core_1.pgTable)('series_standings', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    legId: (0, pg_core_1.uuid)('leg_id')
        .references(() => exports.seriesLegs.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    categoryId: (0, pg_core_1.uuid)('category_id')
        .references(() => categories_schema_1.categories.id, { onDelete: 'restrict' })
        .notNull(),
    totalPsrPoints: (0, pg_core_1.integer)('total_psr_points').default(0).notNull(),
    eventsPlayed: (0, pg_core_1.integer)('events_played').default(0).notNull(),
    bestRank: (0, pg_core_1.integer)('best_rank'),
    directEntry: (0, pg_core_1.boolean)('direct_entry').default(false).notNull(),
    wildcardEntry: (0, pg_core_1.boolean)('wildcard_entry').default(false).notNull(),
    lockedOut: (0, pg_core_1.boolean)('locked_out').default(false).notNull(),
    qualifiedEventId: (0, pg_core_1.uuid)('qualified_event_id')
        .references(() => exports.seriesEvents.id, { onDelete: 'set null' }),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
exports.psrPointLogs = (0, pg_core_1.pgTable)('psr_point_logs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    standingId: (0, pg_core_1.uuid)('standing_id')
        .references(() => exports.seriesStandings.id, { onDelete: 'cascade' })
        .notNull(),
    eventId: (0, pg_core_1.uuid)('event_id')
        .references(() => exports.seriesEvents.id, { onDelete: 'cascade' })
        .notNull(),
    participantId: (0, pg_core_1.uuid)('participant_id')
        .references(() => tournaments_schema_1.tournamentParticipants.id, { onDelete: 'cascade' })
        .notNull(),
    rankAchieved: (0, pg_core_1.integer)('rank_achieved').notNull(),
    basePoints: (0, pg_core_1.integer)('base_points').notNull(),
    bonusPoints: (0, pg_core_1.integer)('bonus_points').default(0).notNull(),
    multiplier: (0, pg_core_1.real)('multiplier').default(1.0).notNull(),
    totalPoints: (0, pg_core_1.integer)('total_points').notNull(),
    isDirectEntry: (0, pg_core_1.boolean)('is_direct_entry').default(false).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
exports.seriesInvitations = (0, pg_core_1.pgTable)('series_invitations', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    seriesId: (0, pg_core_1.uuid)('series_id')
        .references(() => exports.tournamentSeries.id, { onDelete: 'cascade' })
        .notNull(),
    email: (0, pg_core_1.varchar)('email', { length: 255 }),
    phone: (0, pg_core_1.varchar)('phone', { length: 50 }),
    role: (0, pg_core_1.varchar)('role', { length: 50 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('PENDING').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
exports.seriesManagers = (0, pg_core_1.pgTable)('series_managers', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    seriesId: (0, pg_core_1.uuid)('series_id')
        .references(() => exports.tournamentSeries.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    role: (0, pg_core_1.varchar)('role', { length: 50 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
});
//# sourceMappingURL=series.schema.js.map