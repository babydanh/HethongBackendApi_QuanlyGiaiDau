"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchEloOutbox = exports.matchDisputes = exports.matchPlayers = exports.matches = exports.groupStandings = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_schema_1 = require("./users.schema");
const venues_schema_1 = require("./venues.schema");
const tournaments_schema_1 = require("./tournaments.schema");
exports.groupStandings = (0, pg_core_1.pgTable)('group_standings', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    groupId: (0, pg_core_1.uuid)('group_id')
        .references(() => tournaments_schema_1.tournamentGroups.id, { onDelete: 'cascade' })
        .notNull(),
    participantId: (0, pg_core_1.uuid)('participant_id')
        .references(() => tournaments_schema_1.tournamentParticipants.id, { onDelete: 'cascade' })
        .notNull(),
    played: (0, pg_core_1.integer)('played').default(0).notNull(),
    won: (0, pg_core_1.integer)('won').default(0).notNull(),
    lost: (0, pg_core_1.integer)('lost').default(0).notNull(),
    draws: (0, pg_core_1.integer)('draws').default(0).notNull(),
    pointsFor: (0, pg_core_1.integer)('points_for').default(0).notNull(),
    pointsAgainst: (0, pg_core_1.integer)('points_against').default(0).notNull(),
    totalPoints: (0, pg_core_1.integer)('total_points').default(0).notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
}, (table) => ({
    idxStandingsGroupId: (0, pg_core_1.index)('idx_standings_group_id').on(table.groupId),
    idxStandingsGroupParticipantUnique: (0, pg_core_1.uniqueIndex)('idx_standings_group_participant_unique').on(table.groupId, table.participantId),
}));
exports.matches = (0, pg_core_1.pgTable)('matches', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    groupId: (0, pg_core_1.uuid)('group_id')
        .references(() => tournaments_schema_1.tournamentGroups.id, { onDelete: 'cascade' }),
    tournamentId: (0, pg_core_1.uuid)('tournament_id')
        .references(() => tournaments_schema_1.tournaments.id, { onDelete: 'cascade' })
        .notNull(),
    stageId: (0, pg_core_1.uuid)('stage_id')
        .references(() => tournaments_schema_1.tournamentStages.id, { onDelete: 'cascade' })
        .notNull(),
    participant1Id: (0, pg_core_1.uuid)('participant1_id').references(() => tournaments_schema_1.tournamentParticipants.id),
    participant2Id: (0, pg_core_1.uuid)('participant2_id').references(() => tournaments_schema_1.tournamentParticipants.id),
    winnerId: (0, pg_core_1.uuid)('winner_id').references(() => tournaments_schema_1.tournamentParticipants.id),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('SCHEDULED').notNull(),
    scoreDetails: (0, pg_core_1.jsonb)('score_details').default('{}').notNull(),
    p1SetsWon: (0, pg_core_1.integer)('p1_sets_won').default(0).notNull(),
    p2SetsWon: (0, pg_core_1.integer)('p2_sets_won').default(0).notNull(),
    totalSetsPlayed: (0, pg_core_1.integer)('total_sets_played').default(0).notNull(),
    revision: (0, pg_core_1.integer)('revision').default(1).notNull(),
    roundNumber: (0, pg_core_1.integer)('round_number').notNull(),
    matchOrder: (0, pg_core_1.integer)('match_order').notNull(),
    bracketBranch: (0, pg_core_1.varchar)('bracket_branch', { length: 50 })
        .default('MAIN')
        .notNull(),
    isBye: (0, pg_core_1.boolean)('is_bye').default(false).notNull(),
    leg: (0, pg_core_1.integer)('leg'),
    tieId: (0, pg_core_1.varchar)('tie_id', { length: 64 }),
    nextMatchId: (0, pg_core_1.uuid)('next_match_id'),
    loserNextMatchId: (0, pg_core_1.uuid)('loser_next_match_id'),
    courtId: (0, pg_core_1.uuid)('court_id').references(() => venues_schema_1.venueCourts.id, {
        onDelete: 'set null',
    }),
    courtName: (0, pg_core_1.text)('court_name'),
    courtAddress: (0, pg_core_1.text)('court_address'),
    refereeId: (0, pg_core_1.uuid)('referee_id').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    scoreConfirmedBy: (0, pg_core_1.uuid)('score_confirmed_by').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    scoreConfirmedAt: (0, pg_core_1.timestamp)('score_confirmed_at', { withTimezone: true }),
    matchEvidenceImages: (0, pg_core_1.text)('match_evidence_images')
        .array()
        .default((0, drizzle_orm_1.sql) `'{}'::text[]`)
        .notNull(),
    scheduledAt: (0, pg_core_1.timestamp)('scheduled_at', { withTimezone: true }),
    matchConfig: (0, pg_core_1.jsonb)('match_config').default('{}').notNull(),
    startedAt: (0, pg_core_1.timestamp)('started_at', { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)('completed_at', { withTimezone: true }),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
    cheerCount: (0, pg_core_1.integer)('cheer_count').default(0).notNull(),
}, (table) => ({
    setsNonNegative: (0, pg_core_1.check)('sets_non_negative', (0, drizzle_orm_1.sql) `${table.p1SetsWon} >= 0 AND ${table.p2SetsWon} >= 0`),
    differentParticipants: (0, pg_core_1.check)('different_participants', (0, drizzle_orm_1.sql) `${table.participant1Id} IS NULL OR ${table.participant2Id} IS NULL OR ${table.participant1Id} <> ${table.participant2Id}`),
    idxMatchesTournamentStatus: (0, pg_core_1.index)('idx_matches_tournament_status').on(table.tournamentId, table.status),
    idxMatchesStageRoundOrder: (0, pg_core_1.index)('idx_matches_stage_round_order').on(table.stageId, table.roundNumber, table.matchOrder),
    idxMatchesRefereeStatus: (0, pg_core_1.index)('idx_matches_referee_status').on(table.refereeId, table.status),
}));
exports.matchPlayers = (0, pg_core_1.pgTable)('match_players', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    matchId: (0, pg_core_1.uuid)('match_id')
        .references(() => exports.matches.id, { onDelete: 'cascade' })
        .notNull(),
    participantId: (0, pg_core_1.uuid)('participant_id')
        .references(() => tournaments_schema_1.tournamentParticipants.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('PLAYED').notNull(),
});
exports.matchDisputes = (0, pg_core_1.pgTable)('match_disputes', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    matchId: (0, pg_core_1.uuid)('match_id')
        .references(() => exports.matches.id, { onDelete: 'restrict' })
        .notNull(),
    filedBy: (0, pg_core_1.uuid)('filed_by')
        .references(() => users_schema_1.users.id, { onDelete: 'restrict' })
        .notNull(),
    reason: (0, pg_core_1.text)('reason').notNull(),
    evidenceUrls: (0, pg_core_1.text)('evidence_urls')
        .array()
        .default((0, drizzle_orm_1.sql) `'{}'::text[]`)
        .notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('OPEN').notNull(),
    resolvedBy: (0, pg_core_1.uuid)('resolved_by').references(() => users_schema_1.users.id, {
        onDelete: 'set null',
    }),
    resolutionNote: (0, pg_core_1.text)('resolution_note'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
});
exports.matchEloOutbox = (0, pg_core_1.pgTable)('match_elo_outbox', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    matchId: (0, pg_core_1.uuid)('match_id')
        .references(() => exports.matches.id, { onDelete: 'restrict' })
        .notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('PENDING').notNull(),
    attempts: (0, pg_core_1.integer)('attempts').default(0).notNull(),
    nextAttemptAt: (0, pg_core_1.timestamp)('next_attempt_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    lockedAt: (0, pg_core_1.timestamp)('locked_at', { withTimezone: true }),
    lockedBy: (0, pg_core_1.text)('locked_by'),
    lastError: (0, pg_core_1.text)('last_error'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    processedAt: (0, pg_core_1.timestamp)('processed_at', { withTimezone: true }),
}, (table) => ({
    matchIdUnique: (0, pg_core_1.uniqueIndex)('match_elo_outbox_match_id_unique').on(table.matchId),
    idxEloOutboxClaim: (0, pg_core_1.index)('idx_elo_outbox_claim').on(table.status, table.nextAttemptAt),
    idxEloOutboxLease: (0, pg_core_1.index)('idx_elo_outbox_lease')
        .on(table.lockedAt)
        .where((0, drizzle_orm_1.sql) `status = 'PROCESSING'`),
}));
//# sourceMappingURL=matches.schema.js.map