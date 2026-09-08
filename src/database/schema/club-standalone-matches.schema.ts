import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { categories } from './categories.schema';
import { communities } from './communities.schema';
import { users } from './users.schema';

/** A club activity match that is not owned by a social session or tournament. */
export const clubStandaloneMatches = pgTable(
  'club_standalone_matches',
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
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    sideAUserIds: uuid('side_a_user_ids').array().notNull(),
    sideBUserIds: uuid('side_b_user_ids').array().notNull(),
    matchType: varchar('match_type', { length: 24 }).notNull(),
    isRanked: boolean('is_ranked').default(true).notNull(),
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
    /** Exact pre-result rank rows, used only for an authorized delete rollback. */
    eloSnapshot: jsonb('elo_snapshot').$type<Record<string, unknown> | null>(),
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
      'club_standalone_matches_status_check',
      sql`${table.status} IN ('SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED')`,
    ),
    matchTypeCheck: check(
      'club_standalone_matches_match_type_check',
      sql`${table.matchType} IN ('SINGLES', 'DOUBLES', 'MIXED_DOUBLES')`,
    ),
    winnerSideCheck: check(
      'club_standalone_matches_winner_side_check',
      sql`${table.winnerSide} IS NULL OR ${table.winnerSide} IN ('A', 'B')`,
    ),
    scoreCheck: check(
      'club_standalone_matches_score_check',
      sql`${table.p1SetsWon} >= 0 AND ${table.p2SetsWon} >= 0`,
    ),
    communityStatusIdx: index('club_standalone_matches_community_status_idx').on(
      table.communityId,
      table.status,
      table.createdAt,
    ),
    createKeyIdx: index('club_standalone_matches_create_key_idx').on(
      table.createdBy,
      table.idempotencyKey,
    ),
  }),
);
