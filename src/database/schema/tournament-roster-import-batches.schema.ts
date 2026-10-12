import {
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { tournaments } from './tournaments.schema';
import { users } from './users.schema';

export const tournamentRosterImportBatches = pgTable(
  'tournament_roster_import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .references(() => tournaments.id, { onDelete: 'cascade' })
      .notNull(),
    managerUserId: uuid('manager_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestFingerprint: varchar('request_fingerprint', { length: 64 }).notNull(),
    importedCount: integer('imported_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    idempotencyUnique: uniqueIndex(
      'tournament_roster_import_batches_idempotency_unique',
    ).on(table.tournamentId, table.managerUserId, table.idempotencyKey),
  }),
);
