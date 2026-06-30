/**
 * Migration: Add deleted_at to tournament_stages & tournament_groups
 * Run: cd backend-api_qlgiaidau && node scripts/migrate.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const sql = require('postgres')({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'your_password',
  database: process.env.DB_DATABASE || 'tournament_db',
  ssl: 'require',
});

async function run() {
  await sql`ALTER TABLE tournament_stages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  console.log('✅ tournament_stages.deleted_at');
  await sql`ALTER TABLE tournament_groups ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  console.log('✅ tournament_groups.deleted_at');
  console.log('Done');
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });
