import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { communities } from './communities.schema';
import { categories, eloTiers } from './categories.schema';
import { tournaments } from './tournaments.schema';
import { tournamentDivisions } from './tournament_divisions.schema';
import { matches } from './matches.schema';

export const footballTeams = pgTable('football_teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  logoUrl: text('logo_url'),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  communityId: uuid('community_id').references(() => communities.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
}, (table) => ({
  statusIndex: index('idx_football_teams_status').on(table.status, table.updatedAt),
  communityIndex: index('idx_football_teams_community').on(table.communityId, table.status),
  creatorIndex: index('idx_football_teams_creator').on(table.createdBy, table.status),
  statusCheck: check('football_teams_status_check', sql`${table.status} IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')`),
}));

export const footballTeamMembers = pgTable('football_team_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => footballTeams.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 20 }).default('PLAYER').notNull(),
  status: varchar('status', { length: 20 }).default('INVITED').notNull(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  leftAt: timestamp('left_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  teamUserUnique: uniqueIndex('uq_football_team_members_team_user').on(table.teamId, table.userId),
  teamStatusIndex: index('idx_football_team_members_team_status').on(table.teamId, table.status),
  userStatusIndex: index('idx_football_team_members_user_status').on(table.userId, table.status),
  roleCheck: check('football_team_members_role_check', sql`${table.role} IN ('CAPTAIN', 'MANAGER', 'PLAYER')`),
  statusCheck: check('football_team_members_status_check', sql`${table.status} IN ('INVITED', 'ACTIVE', 'DECLINED', 'LEFT', 'REMOVED')`),
}));

export const footballTeamInvites = pgTable('football_team_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => footballTeams.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  status: varchar('status', { length: 20 }).default('PENDING').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
}, (table) => ({
  pendingUnique: uniqueIndex('uq_football_team_invites_pending').on(table.teamId, table.userId, table.status),
  userIndex: index('idx_football_team_invites_user_status').on(table.userId, table.status, table.createdAt),
  statusCheck: check('football_team_invites_status_check', sql`${table.status} IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED')`),
}));

export const tournamentTeamEntries = pgTable('tournament_team_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').references(() => tournaments.id, { onDelete: 'cascade' }).notNull(),
  divisionId: uuid('division_id').references(() => tournamentDivisions.id, { onDelete: 'cascade' }).notNull(),
  teamId: uuid('team_id').references(() => footballTeams.id, { onDelete: 'restrict' }).notNull(),
  status: varchar('status', { length: 30 }).default('DRAFT').notNull(),
  displayNameSnapshot: varchar('display_name_snapshot', { length: 120 }).notNull(),
  logoUrlSnapshot: text('logo_url_snapshot'),
  captainIdsSnapshot: jsonb('captain_ids_snapshot').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tournamentDivisionTeamUnique: uniqueIndex('uq_tournament_team_entries_division_team').on(table.tournamentId, table.divisionId, table.teamId),
  divisionStatusIndex: index('idx_tournament_team_entries_division_status').on(table.divisionId, table.status, table.createdAt),
  statusCheck: check('tournament_team_entries_status_check', sql`${table.status} IN ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'LOCKED', 'WITHDRAWN')`),
}));

export const tournamentTeamRosterSnapshots = pgTable('tournament_team_roster_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').references(() => tournamentTeamEntries.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  role: varchar('role', { length: 12 }).default('MAIN').notNull(),
  jerseyNumber: integer('jersey_number'),
  position: varchar('position', { length: 30 }),
  confirmationStatus: varchar('confirmation_status', { length: 20 }).default('PENDING').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  entryUserUnique: uniqueIndex('uq_tournament_team_roster_entry_user').on(table.entryId, table.userId),
  entryRoleIndex: index('idx_tournament_team_roster_entry_role').on(table.entryId, table.role),
  roleCheck: check('tournament_team_roster_role_check', sql`${table.role} IN ('MAIN', 'RESERVE')`),
  confirmationCheck: check('tournament_team_roster_confirmation_check', sql`${table.confirmationStatus} IN ('PENDING', 'CONFIRMED', 'DECLINED')`),
  jerseyCheck: check('tournament_team_roster_jersey_check', sql`${table.jerseyNumber} IS NULL OR (${table.jerseyNumber} BETWEEN 0 AND 99)`),
}));

export const footballTeamRanks = pgTable('football_team_ranks', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').references(() => footballTeams.id, { onDelete: 'cascade' }).notNull(),
  categoryId: uuid('category_id').references(() => categories.id).notNull(),
  tierId: uuid('tier_id').references(() => eloTiers.id, { onDelete: 'set null' }),
  eloPoints: integer('elo_points').default(1000).notNull(),
  matchesPlayed: integer('matches_played').default(0).notNull(),
  matchesWon: integer('matches_won').default(0).notNull(),
  winStreak: integer('win_streak').default(0).notNull(),
  peakElo: integer('peak_elo').default(1000).notNull(),
  lastMatchAt: timestamp('last_match_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  teamCategoryUnique: uniqueIndex('uq_football_team_ranks_team_category').on(table.teamId, table.categoryId),
  leaderboardIndex: index('idx_football_team_ranks_leaderboard').on(table.categoryId, table.eloPoints, table.teamId),
  statsCheck: check('football_team_ranks_stats_check', sql`${table.eloPoints} >= 0 AND ${table.matchesPlayed} >= 0 AND ${table.matchesWon} >= 0 AND ${table.matchesWon} <= ${table.matchesPlayed}`),
}));

export const footballEloEvents = pgTable('football_elo_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamRankId: uuid('team_rank_id').references(() => footballTeamRanks.id, { onDelete: 'cascade' }).notNull(),
  matchId: uuid('match_id').references(() => matches.id, { onDelete: 'restrict' }).notNull(),
  beforeElo: integer('before_elo').notNull(),
  afterElo: integer('after_elo').notNull(),
  delta: integer('delta').notNull(),
  outcome: varchar('outcome', { length: 20 }).notNull(),
  reason: varchar('reason', { length: 40 }).default('MATCH_COMPLETED').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  matchTeamUnique: uniqueIndex('uq_football_elo_events_match_team').on(table.matchId, table.teamRankId),
  teamHistoryIndex: index('idx_football_elo_events_team_created').on(table.teamRankId, table.createdAt),
  outcomeCheck: check('football_elo_events_outcome_check', sql`${table.outcome} IN ('WIN', 'DRAW', 'LOSS', 'FORFEIT', 'NO_SHOW')`),
}));

