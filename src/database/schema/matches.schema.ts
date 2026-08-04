import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  integer,
  boolean,
  timestamp,
  check,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { venueCourts } from './venues.schema';
import { tournamentGroups, tournamentParticipants, tournaments, tournamentStages } from './tournaments.schema';

export const groupStandings = pgTable('group_standings', {
  id: uuid('id').primaryKey().defaultRandom(),
  groupId: uuid('group_id')
    .references(() => tournamentGroups.id, { onDelete: 'cascade' })
    .notNull(),
  participantId: uuid('participant_id')
    .references(() => tournamentParticipants.id, { onDelete: 'cascade' })
    .notNull(),
  played: integer('played').default(0).notNull(),
  won: integer('won').default(0).notNull(),
  lost: integer('lost').default(0).notNull(),
  draws: integer('draws').default(0).notNull(),
  pointsFor: integer('points_for').default(0).notNull(),
  pointsAgainst: integer('points_against').default(0).notNull(),
  totalPoints: integer('total_points').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
}, (table) => ({
  idxStandingsGroupId: index('idx_standings_group_id').on(table.groupId),
  idxStandingsGroupParticipantUnique: uniqueIndex(
    'idx_standings_group_participant_unique',
  ).on(table.groupId, table.participantId),
}));

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .references(() => tournamentGroups.id, { onDelete: 'cascade' }),
    tournamentId: uuid('tournament_id')
      .references(() => tournaments.id, { onDelete: 'cascade' })
      .notNull(),
    stageId: uuid('stage_id')
      .references(() => tournamentStages.id, { onDelete: 'cascade' })
      .notNull(),
    participant1Id: uuid('participant1_id').references(
      () => tournamentParticipants.id,
    ),
    participant2Id: uuid('participant2_id').references(
      () => tournamentParticipants.id,
    ),
    winnerId: uuid('winner_id').references(() => tournamentParticipants.id),
    status: varchar('status', { length: 50 }).default('SCHEDULED').notNull(),
    scoreDetails: jsonb('score_details').default('{}').notNull(),
    p1SetsWon: integer('p1_sets_won').default(0).notNull(),
    p2SetsWon: integer('p2_sets_won').default(0).notNull(),
    totalSetsPlayed: integer('total_sets_played').default(0).notNull(),
    revision: integer('revision').default(1).notNull(),
    roundNumber: integer('round_number').notNull(),
    matchOrder: integer('match_order').notNull(),
    bracketBranch: varchar('bracket_branch', { length: 50 })
      .default('MAIN')
      .notNull(),
    isBye: boolean('is_bye').default(false).notNull(),
    // Self references for bracket tree
    nextMatchId: uuid('next_match_id'), // fk added later
    loserNextMatchId: uuid('loser_next_match_id'), // fk added later
    courtId: uuid('court_id').references(() => venueCourts.id, {
      onDelete: 'set null',
    }),
    courtName: text('court_name'),
    courtAddress: text('court_address'),
    refereeId: uuid('referee_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    scoreConfirmedBy: uuid('score_confirmed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    scoreConfirmedAt: timestamp('score_confirmed_at', { withTimezone: true }),
    matchEvidenceImages: text('match_evidence_images')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    matchConfig: jsonb('match_config').default('{}').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    cheerCount: integer('cheer_count').default(0).notNull(),
  },
  (table) => ({
    setsNonNegative: check(
      'sets_non_negative',
      sql`${table.p1SetsWon} >= 0 AND ${table.p2SetsWon} >= 0`,
    ),
    differentParticipants: check(
      'different_participants',
      sql`${table.participant1Id} IS NULL OR ${table.participant2Id} IS NULL OR ${table.participant1Id} <> ${table.participant2Id}`,
    ),
    idxMatchesTournamentStatus: index('idx_matches_tournament_status').on(
      table.tournamentId,
      table.status,
    ),
    idxMatchesStageRoundOrder: index('idx_matches_stage_round_order').on(
      table.stageId,
      table.roundNumber,
      table.matchOrder,
    ),
    idxMatchesRefereeStatus: index('idx_matches_referee_status').on(
      table.refereeId,
      table.status,
    ),
  }),
);

export const matchPlayers = pgTable('match_players', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id')
    .references(() => matches.id, { onDelete: 'cascade' })
    .notNull(),
  participantId: uuid('participant_id')
    .references(() => tournamentParticipants.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  status: varchar('status', { length: 50 }).default('PLAYED').notNull(),
});

export const matchDisputes = pgTable('match_disputes', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id')
    .references(() => matches.id, { onDelete: 'restrict' })
    .notNull(),
  filedBy: uuid('filed_by')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  reason: text('reason').notNull(),
  evidenceUrls: text('evidence_urls')
    .array()
    .default(sql`'{}'::text[]`)
    .notNull(),
  status: varchar('status', { length: 50 }).default('OPEN').notNull(),
  resolvedBy: uuid('resolved_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  resolutionNote: text('resolution_note'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

// ELO transactional outbox (NOTE-3): completion tx enqueues one row per ranked
// match; worker claims via status + lease. State machine:
//   PENDING(retryable) → PROCESSING(lease) → PROCESSED(ok) | FAILED(terminal)
//   retryable failure returns to PENDING with backoff.
export const matchEloOutbox = pgTable(
  'match_elo_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matchId: uuid('match_id')
      .references(() => matches.id, { onDelete: 'restrict' })
      .notNull(),
    status: varchar('status', { length: 20 }).default('PENDING').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    matchIdUnique: uniqueIndex('match_elo_outbox_match_id_unique').on(table.matchId),
    idxEloOutboxClaim: index('idx_elo_outbox_claim').on(table.status, table.nextAttemptAt),
    idxEloOutboxLease: index('idx_elo_outbox_lease')
      .on(table.lockedAt)
      .where(sql`status = 'PROCESSING'`),
  }),
);
