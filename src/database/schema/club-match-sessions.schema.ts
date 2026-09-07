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
import { categories } from './categories.schema';
import { communities } from './communities.schema';
import { users } from './users.schema';

export const clubMatchSessions = pgTable(
  'club_match_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    communityId: uuid('community_id')
      .references(() => communities.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'restrict' })
      .notNull(),
    createdBy: uuid('created_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    name: varchar('name', { length: 255 }),
    description: text('description'),
    status: varchar('status', { length: 20 }).default('OPEN').notNull(),
    registrationMode: varchar('registration_mode', { length: 24 })
      .default('MIXED')
      .notNull(),
    pairingMode: varchar('pairing_mode', { length: 20 })
      .default('FREE')
      .notNull(),
    isRanked: boolean('is_ranked').default(true).notNull(),
    maxParticipants: integer('max_participants').default(16).notNull(),
    sessionConfig: jsonb('session_config').default('{}').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }),
    endAt: timestamp('end_at', { withTimezone: true }),
    registrationOpenAt: timestamp('registration_open_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    registrationClosedAt: timestamp('registration_closed_at', {
      withTimezone: true,
    }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    statusCheck: check(
      'club_match_sessions_status_check',
      sql`${table.status} IN ('OPEN', 'LIVE', 'CLOSED', 'ENDED', 'CANCELLED')`,
    ),
    registrationModeCheck: check(
      'club_match_sessions_registration_mode_check',
      sql`${table.registrationMode} IN ('SELF', 'MANAGER_ASSIGN', 'MIXED')`,
    ),
    pairingModeCheck: check(
      'club_match_sessions_pairing_mode_check',
      sql`${table.pairingMode} = 'FREE'`,
    ),
    maxParticipantsCheck: check(
      'club_match_sessions_max_participants_check',
      sql`${table.maxParticipants} BETWEEN 2 AND 128`,
    ),
    scheduleCheck: check(
      'club_match_sessions_schedule_check',
      sql`${table.startAt} IS NULL OR ${table.endAt} IS NULL OR ${table.endAt} >= ${table.startAt}`,
    ),
    communityStatusIdx: index('club_match_sessions_community_status_idx').on(
      table.communityId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const clubMatchSessionParticipants = pgTable(
  'club_match_session_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => clubMatchSessions.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    source: varchar('source', { length: 20 }).default('SELF').notNull(),
    status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
    assignedBy: uuid('assigned_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueSessionUser: uniqueIndex(
      'club_match_session_participants_session_user_unique',
    ).on(table.sessionId, table.userId),
    sourceCheck: check(
      'club_match_session_participants_source_check',
      sql`${table.source} IN ('SELF', 'MANDATORY')`,
    ),
    statusCheck: check(
      'club_match_session_participants_status_check',
      sql`${table.status} IN ('ACTIVE', 'WITHDRAWN', 'KICKED')`,
    ),
    sessionStatusIdx: index(
      'club_match_session_participants_session_status_idx',
    ).on(table.sessionId, table.status, table.createdAt),
  }),
);

export const clubMatchPreferences = pgTable(
  'club_match_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => clubMatchSessions.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    preferredPartnerUserIds: uuid('preferred_partner_user_ids')
      .array()
      .default(sql`'{}'::uuid[]`)
      .notNull(),
    preferredOpponentUserIds: uuid('preferred_opponent_user_ids')
      .array()
      .default(sql`'{}'::uuid[]`)
      .notNull(),
    avoidUserIds: uuid('avoid_user_ids')
      .array()
      .default(sql`'{}'::uuid[]`)
      .notNull(),
    version: integer('version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueSessionUser: uniqueIndex(
      'club_match_preferences_session_user_unique',
    ).on(table.sessionId, table.userId),
  }),
);

export const clubMatchSessionMatches = pgTable(
  'club_match_session_matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => clubMatchSessions.id, { onDelete: 'cascade' })
      .notNull(),
    createdBy: uuid('created_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    sideAUserIds: uuid('side_a_user_ids').array().notNull(),
    sideBUserIds: uuid('side_b_user_ids').array().notNull(),
    matchType: varchar('match_type', { length: 24 }).notNull(),
    status: varchar('status', { length: 20 }).default('SCHEDULED').notNull(),
    scoreDetails: jsonb('score_details').default('{}').notNull(),
    p1SetsWon: integer('p1_sets_won').default(0).notNull(),
    p2SetsWon: integer('p2_sets_won').default(0).notNull(),
    winnerSide: varchar('winner_side', { length: 8 }),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    scoreConfirmedBy: uuid('score_confirmed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    revision: integer('revision').default(1).notNull(),
    eloStatus: varchar('elo_status', { length: 24 })
      .default('WAITING_RESULT')
      .notNull(),
    eloDelta: jsonb('elo_delta').$type<Record<string, number> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    statusCheck: check(
      'club_match_session_matches_status_check',
      sql`${table.status} IN ('SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED')`,
    ),
    matchTypeCheck: check(
      'club_match_session_matches_match_type_check',
      sql`${table.matchType} IN ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES')`,
    ),
    winnerSideCheck: check(
      'club_match_session_matches_winner_side_check',
      sql`${table.winnerSide} IS NULL OR ${table.winnerSide} IN ('A', 'B')`,
    ),
    scoreCheck: check(
      'club_match_session_matches_score_check',
      sql`${table.p1SetsWon} >= 0 AND ${table.p2SetsWon} >= 0`,
    ),
    sessionStatusIdx: index('club_match_session_matches_session_status_idx').on(
      table.sessionId,
      table.status,
      table.createdAt,
    ),
  }),
);

export const clubMatchSessionCommands = pgTable(
  'club_match_session_commands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => clubMatchSessions.id, { onDelete: 'cascade' })
      .notNull(),
    actorId: uuid('actor_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    operation: varchar('operation', { length: 40 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', {
      length: 64,
    }).notNull(),
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    uniqueActorOperationKey: uniqueIndex(
      'club_match_session_commands_actor_operation_key_unique',
    ).on(table.actorId, table.operation, table.idempotencyKey),
  }),
);
