/**
 * Migration script: Add deleted_at columns to tournament_stages and tournament_groups
 *
 * Cách chạy:
 *   cd backend-api_qlgiaidau
 *   node -r dotenv/config scripts/migrate-deleted-at.js
 *
 * Hoặc copy-paste SQL vào Supabase SQL Editor.
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DB_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'your_password',
  database: process.env.DB_DATABASE || 'tournament_db',
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Connected to DB. Running migration...');

    // Thêm deleted_at vào tournament_stages
    await client.query(`
      ALTER TABLE tournament_stages
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);
    console.log('✅ Added deleted_at to tournament_stages');

    // Thêm deleted_at vào tournament_groups
    await client.query(`
      ALTER TABLE tournament_groups
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    `);
    console.log('✅ Added deleted_at to tournament_groups');

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
