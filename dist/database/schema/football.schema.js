"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.footballEloEvents = exports.footballTeamRanks = exports.tournamentTeamRosterSnapshots = exports.tournamentTeamEntries = exports.footballTeamInvites = exports.footballTeamMembers = exports.footballTeams = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_schema_1 = require("./users.schema");
const communities_schema_1 = require("./communities.schema");
const categories_schema_1 = require("./categories.schema");
const tournaments_schema_1 = require("./tournaments.schema");
const tournament_divisions_schema_1 = require("./tournament_divisions.schema");
const matches_schema_1 = require("./matches.schema");
exports.footballTeams = (0, pg_core_1.pgTable)('football_teams', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)('name', { length: 120 }).notNull(),
    logoUrl: (0, pg_core_1.text)('logo_url'),
    categoryId: (0, pg_core_1.uuid)('category_id').references(() => categories_schema_1.categories.id).notNull(),
    communityId: (0, pg_core_1.uuid)('community_id').references(() => communities_schema_1.communities.id, { onDelete: 'set null' }),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('ACTIVE').notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_schema_1.users.id, { onDelete: 'restrict' }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: (0, pg_core_1.timestamp)('archived_at', { withTimezone: true }),
}, (table) => ({
    statusIndex: (0, pg_core_1.index)('idx_football_teams_status').on(table.status, table.updatedAt),
    communityIndex: (0, pg_core_1.index)('idx_football_teams_community').on(table.communityId, table.status),
    creatorIndex: (0, pg_core_1.index)('idx_football_teams_creator').on(table.createdBy, table.status),
    statusCheck: (0, pg_core_1.check)('football_teams_status_check', (0, drizzle_orm_1.sql) `${table.status} IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')`),
}));
exports.footballTeamMembers = (0, pg_core_1.pgTable)('football_team_members', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    teamId: (0, pg_core_1.uuid)('team_id').references(() => exports.footballTeams.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    role: (0, pg_core_1.varchar)('role', { length: 20 }).default('PLAYER').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('INVITED').notNull(),
    invitedBy: (0, pg_core_1.uuid)('invited_by').references(() => users_schema_1.users.id, { onDelete: 'set null' }),
    joinedAt: (0, pg_core_1.timestamp)('joined_at', { withTimezone: true }),
    leftAt: (0, pg_core_1.timestamp)('left_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    teamUserUnique: (0, pg_core_1.uniqueIndex)('uq_football_team_members_team_user').on(table.teamId, table.userId),
    teamStatusIndex: (0, pg_core_1.index)('idx_football_team_members_team_status').on(table.teamId, table.status),
    userStatusIndex: (0, pg_core_1.index)('idx_football_team_members_user_status').on(table.userId, table.status),
    roleCheck: (0, pg_core_1.check)('football_team_members_role_check', (0, drizzle_orm_1.sql) `${table.role} IN ('CAPTAIN', 'MANAGER', 'PLAYER')`),
    statusCheck: (0, pg_core_1.check)('football_team_members_status_check', (0, drizzle_orm_1.sql) `${table.status} IN ('INVITED', 'ACTIVE', 'DECLINED', 'LEFT', 'REMOVED')`),
}));
exports.footballTeamInvites = (0, pg_core_1.pgTable)('football_team_invites', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    teamId: (0, pg_core_1.uuid)('team_id').references(() => exports.footballTeams.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'cascade' }).notNull(),
    invitedBy: (0, pg_core_1.uuid)('invited_by').references(() => users_schema_1.users.id, { onDelete: 'restrict' }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('PENDING').notNull(),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    respondedAt: (0, pg_core_1.timestamp)('responded_at', { withTimezone: true }),
}, (table) => ({
    pendingUnique: (0, pg_core_1.uniqueIndex)('uq_football_team_invites_pending')
        .on(table.teamId, table.userId)
        .where((0, drizzle_orm_1.sql) `${table.status} = 'PENDING'`),
    userIndex: (0, pg_core_1.index)('idx_football_team_invites_user_status').on(table.userId, table.status, table.createdAt),
    statusCheck: (0, pg_core_1.check)('football_team_invites_status_check', (0, drizzle_orm_1.sql) `${table.status} IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED')`),
}));
exports.tournamentTeamEntries = (0, pg_core_1.pgTable)('tournament_team_entries', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    tournamentId: (0, pg_core_1.uuid)('tournament_id').references(() => tournaments_schema_1.tournaments.id, { onDelete: 'cascade' }).notNull(),
    divisionId: (0, pg_core_1.uuid)('division_id').references(() => tournament_divisions_schema_1.tournamentDivisions.id, { onDelete: 'cascade' }).notNull(),
    teamId: (0, pg_core_1.uuid)('team_id').references(() => exports.footballTeams.id, { onDelete: 'restrict' }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).default('DRAFT').notNull(),
    displayNameSnapshot: (0, pg_core_1.varchar)('display_name_snapshot', { length: 120 }).notNull(),
    logoUrlSnapshot: (0, pg_core_1.text)('logo_url_snapshot'),
    captainIdsSnapshot: (0, pg_core_1.jsonb)('captain_ids_snapshot').$type().default((0, drizzle_orm_1.sql) `'[]'::jsonb`).notNull(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_schema_1.users.id, { onDelete: 'restrict' }).notNull(),
    confirmedAt: (0, pg_core_1.timestamp)('confirmed_at', { withTimezone: true }),
    lockedAt: (0, pg_core_1.timestamp)('locked_at', { withTimezone: true }),
    withdrawnAt: (0, pg_core_1.timestamp)('withdrawn_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    tournamentDivisionTeamUnique: (0, pg_core_1.uniqueIndex)('uq_tournament_team_entries_division_team').on(table.tournamentId, table.divisionId, table.teamId),
    divisionStatusIndex: (0, pg_core_1.index)('idx_tournament_team_entries_division_status').on(table.divisionId, table.status, table.createdAt),
    statusCheck: (0, pg_core_1.check)('tournament_team_entries_status_check', (0, drizzle_orm_1.sql) `${table.status} IN ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'LOCKED', 'WITHDRAWN')`),
}));
exports.tournamentTeamRosterSnapshots = (0, pg_core_1.pgTable)('tournament_team_roster_snapshots', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    entryId: (0, pg_core_1.uuid)('entry_id').references(() => exports.tournamentTeamEntries.id, { onDelete: 'cascade' }).notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_schema_1.users.id, { onDelete: 'restrict' }).notNull(),
    role: (0, pg_core_1.varchar)('role', { length: 12 }).default('MAIN').notNull(),
    jerseyNumber: (0, pg_core_1.integer)('jersey_number'),
    position: (0, pg_core_1.varchar)('position', { length: 30 }),
    confirmationStatus: (0, pg_core_1.varchar)('confirmation_status', { length: 20 }).default('PENDING').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    entryUserUnique: (0, pg_core_1.uniqueIndex)('uq_tournament_team_roster_entry_user').on(table.entryId, table.userId),
    entryRoleIndex: (0, pg_core_1.index)('idx_tournament_team_roster_entry_role').on(table.entryId, table.role),
    roleCheck: (0, pg_core_1.check)('tournament_team_roster_role_check', (0, drizzle_orm_1.sql) `${table.role} IN ('MAIN', 'RESERVE')`),
    confirmationCheck: (0, pg_core_1.check)('tournament_team_roster_confirmation_check', (0, drizzle_orm_1.sql) `${table.confirmationStatus} IN ('PENDING', 'CONFIRMED', 'DECLINED')`),
    jerseyCheck: (0, pg_core_1.check)('tournament_team_roster_jersey_check', (0, drizzle_orm_1.sql) `${table.jerseyNumber} IS NULL OR (${table.jerseyNumber} BETWEEN 0 AND 99)`),
}));
exports.footballTeamRanks = (0, pg_core_1.pgTable)('football_team_ranks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    teamId: (0, pg_core_1.uuid)('team_id').references(() => exports.footballTeams.id, { onDelete: 'cascade' }).notNull(),
    categoryId: (0, pg_core_1.uuid)('category_id').references(() => categories_schema_1.categories.id).notNull(),
    tierId: (0, pg_core_1.uuid)('tier_id').references(() => categories_schema_1.eloTiers.id, { onDelete: 'set null' }),
    eloPoints: (0, pg_core_1.integer)('elo_points').default(1000).notNull(),
    matchesPlayed: (0, pg_core_1.integer)('matches_played').default(0).notNull(),
    matchesWon: (0, pg_core_1.integer)('matches_won').default(0).notNull(),
    winStreak: (0, pg_core_1.integer)('win_streak').default(0).notNull(),
    peakElo: (0, pg_core_1.integer)('peak_elo').default(1000).notNull(),
    lastMatchAt: (0, pg_core_1.timestamp)('last_match_at', { withTimezone: true }),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    teamCategoryUnique: (0, pg_core_1.uniqueIndex)('uq_football_team_ranks_team_category').on(table.teamId, table.categoryId),
    leaderboardIndex: (0, pg_core_1.index)('idx_football_team_ranks_leaderboard').on(table.categoryId, table.eloPoints, table.teamId),
    statsCheck: (0, pg_core_1.check)('football_team_ranks_stats_check', (0, drizzle_orm_1.sql) `${table.eloPoints} >= 0 AND ${table.matchesPlayed} >= 0 AND ${table.matchesWon} >= 0 AND ${table.matchesWon} <= ${table.matchesPlayed}`),
}));
exports.footballEloEvents = (0, pg_core_1.pgTable)('football_elo_events', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    teamRankId: (0, pg_core_1.uuid)('team_rank_id').references(() => exports.footballTeamRanks.id, { onDelete: 'cascade' }).notNull(),
    matchId: (0, pg_core_1.uuid)('match_id').references(() => matches_schema_1.matches.id, { onDelete: 'restrict' }).notNull(),
    beforeElo: (0, pg_core_1.integer)('before_elo').notNull(),
    afterElo: (0, pg_core_1.integer)('after_elo').notNull(),
    delta: (0, pg_core_1.integer)('delta').notNull(),
    outcome: (0, pg_core_1.varchar)('outcome', { length: 20 }).notNull(),
    reason: (0, pg_core_1.varchar)('reason', { length: 40 }).default('MATCH_COMPLETED').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    matchTeamUnique: (0, pg_core_1.uniqueIndex)('uq_football_elo_events_match_team').on(table.matchId, table.teamRankId),
    teamHistoryIndex: (0, pg_core_1.index)('idx_football_elo_events_team_created').on(table.teamRankId, table.createdAt),
    outcomeCheck: (0, pg_core_1.check)('football_elo_events_outcome_check', (0, drizzle_orm_1.sql) `${table.outcome} IN ('WIN', 'DRAW', 'LOSS', 'FORFEIT', 'NO_SHOW')`),
}));
//# sourceMappingURL=football.schema.js.map