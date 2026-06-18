const postgres = require('postgres');

const sql = postgres({
  host: 'aws-1-ap-southeast-1.pooler.supabase.com',
  port: 5432,
  username: 'postgres.xhamzckqefydygejljgo',
  password: 'Danh@@27122005',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  prepare: false,
});

async function runMigration() {
  try {
    console.log('Running migration 0026...');
    await sql.unsafe(`
      ALTER TABLE "tournament_divisions"
      ADD COLUMN IF NOT EXISTS "venue_id" uuid REFERENCES "tournament_venues"("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "bracket_type" varchar(50),
      ADD COLUMN IF NOT EXISTS "round_config" jsonb,
      ADD COLUMN IF NOT EXISTS "start_date" timestamp with time zone,
      ADD COLUMN IF NOT EXISTS "registration_end_date" timestamp with time zone,
      ADD COLUMN IF NOT EXISTS "min_elo" integer,
      ADD COLUMN IF NOT EXISTS "max_elo" integer,
      ADD COLUMN IF NOT EXISTS "prize_description" text;
    `);
    console.log('✅ Migration 0026 applied successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await sql.end();
  }
}

runMigration();
