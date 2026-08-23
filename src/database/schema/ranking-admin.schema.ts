import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  boolean,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { categories } from './categories.schema';
import { communities } from './communities.schema';

export const rankingContextStatuses = pgTable(
  'ranking_context_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'cascade' })
      .notNull(),
    scope: varchar('scope', { length: 20 }).notNull(),
    communityId: uuid('community_id').references(() => communities.id, {
      onDelete: 'cascade',
    }),
    matchType: varchar('match_type', { length: 50 }).notNull(),
    genderRestriction: varchar('gender_restriction', { length: 20 }),
    status: varchar('status', { length: 20 }).notNull().default('VISIBLE'),
    reason: text('reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    changedBy: uuid('changed_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    contextUnique: uniqueIndex('ranking_context_status_context_idx').on(
      table.userId,
      table.categoryId,
      table.scope,
      sql`coalesce(${table.communityId}::text, '')`,
      table.matchType,
      sql`coalesce(${table.genderRestriction}, '')`,
    ),
    lookupIdx: index('ranking_context_status_lookup_idx').on(
      table.categoryId,
      table.scope,
      table.communityId,
      table.matchType,
      table.status,
    ),
    stateValid: check(
      'ranking_context_status_state_valid',
      sql`${table.status} in ('VISIBLE', 'HIDDEN', 'BANNED')`,
    ),
    scopeValid: check(
      'ranking_context_status_scope_valid',
      sql`(${table.scope} = 'PUBLIC' and ${table.communityId} is null) or (${table.scope} = 'COMMUNITY' and ${table.communityId} is not null)`,
    ),
    expiryValid: check(
      'ranking_context_status_expiry_valid',
      sql`${table.expiresAt} is null or ${table.status} in ('HIDDEN', 'BANNED')`,
    ),
    reasonValid: check(
      'ranking_context_status_reason_valid',
      sql`${table.status} = 'VISIBLE' or (${table.reason} is not null and char_length(btrim(${table.reason})) between 5 and 500)`,
    ),
  }),
);

export const adminEloOperations = pgTable(
  'admin_elo_operations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    operationKey: varchar('operation_key', { length: 128 }).notNull(),
    payloadFingerprint: varchar('payload_fingerprint', {
      length: 64,
    }).notNull(),
    adminUserId: uuid('admin_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'restrict' })
      .notNull(),
    scope: varchar('scope', { length: 20 }).notNull(),
    communityId: uuid('community_id').references(() => communities.id, {
      onDelete: 'restrict',
    }),
    matchType: varchar('match_type', { length: 50 }).notNull(),
    genderRestriction: varchar('gender_restriction', { length: 20 }),
    operation: varchar('operation', { length: 20 }).notNull(),
    requestedValue: integer('requested_value'),
    previousElo: integer('previous_elo'),
    newElo: integer('new_elo'),
    changedPoints: integer('changed_points'),
    previousStatus: varchar('previous_status', { length: 20 }),
    newStatus: varchar('new_status', { length: 20 }),
    previousLeaderboardEligible: boolean('previous_leaderboard_eligible'),
    newLeaderboardEligible: boolean('new_leaderboard_eligible'),
    reason: text('reason').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    operationKeyUnique: uniqueIndex('admin_elo_operations_key_idx').on(
      table.operationKey,
    ),
    targetHistoryIdx: index('admin_elo_operations_target_history_idx').on(
      table.userId,
      table.createdAt,
    ),
    actorHistoryIdx: index('admin_elo_operations_actor_history_idx').on(
      table.adminUserId,
      table.createdAt,
    ),
    operationValid: check(
      'admin_elo_operations_operation_valid',
      sql`${table.operation} in ('ADD', 'SUBTRACT', 'SET', 'RESET', 'HIDE', 'BAN', 'RESTORE')`,
    ),
    scopeValid: check(
      'admin_elo_operations_scope_valid',
      sql`(${table.scope} = 'PUBLIC' and ${table.communityId} is null) or (${table.scope} = 'COMMUNITY' and ${table.communityId} is not null)`,
    ),
    eloNonNegative: check(
      'admin_elo_operations_elo_non_negative',
      sql`(${table.previousElo} is null or ${table.previousElo} >= 0) and (${table.newElo} is null or ${table.newElo} >= 0)`,
    ),
    requestedValueValid: check(
      'admin_elo_operations_requested_value_valid',
      sql`( ${table.operation} in ('ADD', 'SUBTRACT', 'SET') and ${table.requestedValue} > 0 and ${table.requestedValue} <= 10000 ) or ( ${table.operation} in ('RESET', 'HIDE', 'BAN', 'RESTORE') and ${table.requestedValue} is null )`,
    ),
    reasonValid: check(
      'admin_elo_operations_reason_valid',
      sql`char_length(btrim(${table.reason})) between 5 and 500`,
    ),
    expiryValid: check(
      'admin_elo_operations_expiry_valid',
      sql`${table.expiresAt} is null or ${table.operation} in ('HIDE', 'BAN')`,
    ),
    statusValid: check(
      'admin_elo_operations_status_valid',
      sql`(${table.previousStatus} is null or ${table.previousStatus} in ('VISIBLE', 'HIDDEN', 'BANNED')) and (${table.newStatus} is null or ${table.newStatus} in ('VISIBLE', 'HIDDEN', 'BANNED'))`,
    ),
  }),
);
