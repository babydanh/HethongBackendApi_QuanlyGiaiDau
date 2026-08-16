'use strict';

/**
 * Read-only release gate for the football/team registration schema.
 * The migration runner owns schema changes; this script only checks that the
 * tables and columns required by the football flows exist after a clean run.
 */
const postgres = require('postgres');

const sql = postgres({
  host: process.env.DB_HOST || 'localhost',
  port: Number.parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'tournament_db',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  prepare: false,
  max: 1,
  connect_timeout: 15,
  connection: { search_path: 'public' },
});

const requiredSchema = {
  football_teams: ['id', 'name', 'category_id', 'created_by', 'status'],
  football_team_members: ['team_id', 'user_id', 'role', 'status'],
  football_team_invites: ['team_id', 'user_id', 'invited_by', 'status'],
  tournament_team_entries: [
    'tournament_id',
    'division_id',
    'team_id',
    'status',
  ],
  tournament_team_roster_snapshots: [
    'entry_id',
    'user_id',
    'role',
    'confirmation_status',
  ],
  football_team_ranks: [
    'team_id',
    'category_id',
    'elo_points',
    'matches_played',
    'peak_elo',
  ],
  football_elo_events: [
    'team_rank_id',
    'match_id',
    'before_elo',
    'after_elo',
    'delta',
  ],
  tournament_divisions: [
    'id',
    'tournament_id',
    'name',
    'match_type',
    'gender_restriction',
  ],
};

const requiredIndexes = [
  'uq_football_team_members_team_user',
  'uq_football_team_invites_pending',
  'uq_tournament_team_entries_division_team',
  'uq_tournament_team_roster_entry_user',
  'uq_football_team_ranks_team_category',
  'uq_football_elo_events_match_team',
];

async function verify() {
  const missing = [];
  for (const [table, columns] of Object.entries(requiredSchema)) {
    const rows = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
    `;
    const present = new Set(rows.map((row) => row.column_name));
    if (rows.length === 0) missing.push(`${table} (table)`);
    for (const column of columns) {
      if (!present.has(column)) missing.push(`${table}.${column}`);
    }
  }

  const [migration] = await sql`
    SELECT to_regclass('public.__drizzle_migrations') AS migration_table
  `;
  if (!migration?.migration_table) missing.push('__drizzle_migrations (table)');

  const indexes = await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ANY(${sql.array(requiredIndexes)})
  `;
  const presentIndexes = new Set(indexes.map((row) => row.indexname));
  for (const index of requiredIndexes) {
    if (!presentIndexes.has(index)) missing.push(`${index} (index)`);
  }

  if (missing.length > 0) {
    throw new Error(
      `Football schema verification failed: ${missing.join(', ')}`,
    );
  }
  console.log(
    `Football schema verification passed (${Object.keys(requiredSchema).length} tables).`,
  );
}

verify()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
