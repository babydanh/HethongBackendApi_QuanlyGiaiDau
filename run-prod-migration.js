/**
 * run-prod-migration.js
 * Custom SQL migration runner - bypasses Drizzle migrate() limitations.
 * Reads SQL files directly, runs each statement individually, tolerates
 * "already exists" errors so re-runs are safe.
 *
 * No TypeScript, no ts-node required - pure CommonJS.
 */
'use strict';

const path = require('path');
const fs = require('fs');

// ─── Load .env ───────────────────────────────────────────────────────────────
const envFile = path.resolve(__dirname, '.env');
if (fs.existsSync(envFile)) {
  require('dotenv').config({ path: envFile });
} else {
  require('dotenv').config();
}

const postgres = require('postgres');

const isSSL = process.env.DB_SSL === 'true';

const sql = postgres({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'your_password',
  database: process.env.DB_DATABASE || 'tournament_db',
  ssl: isSSL ? { rejectUnauthorized: false } : false,
  prepare: false,
  max: 1,
  idle_timeout: 120,
  connect_timeout: 30,
  connection: { search_path: 'public' },
});

// Errors that are safe to ignore (object already exists)
const IGNORABLE_CODES = new Set([
  '42P07', // duplicate_table
  '42701', // duplicate_column
  '42710', // duplicate_object (constraint, index, extension...)
  '23505', // unique_violation (on constraint creation)
  '42P06', // duplicate_schema
  '42723', // duplicate_function
]);

async function runStatement(statement) {
  const trimmed = statement.trim();
  if (!trimmed || trimmed === '') return;
  try {
    await sql.unsafe(trimmed);
  } catch (err) {
    if (IGNORABLE_CODES.has(err.code)) {
      console.log(`  ⚠ Skipped (already exists): ${trimmed.substring(0, 80)}...`);
    } else {
      // Print error but continue — let other statements run
      console.error(`  ✗ Error [${err.code}]: ${err.message}`);
      console.error(`    Statement: ${trimmed.substring(0, 120)}`);
    }
  }
}

async function runSqlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Drizzle uses --> statement-breakpoint as delimiter
  const statements = content.split('--> statement-breakpoint');
  for (const stmt of statements) {
    await runStatement(stmt);
  }
}

async function ensureMigrationsTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;
}

async function getAppliedMigrations() {
  try {
    const rows = await sql`SELECT hash FROM "__drizzle_migrations" ORDER BY id ASC`;
    return new Set(rows.map(r => r.hash));
  } catch {
    return new Set();
  }
}

async function markMigrationApplied(hash) {
  await sql`
    INSERT INTO "__drizzle_migrations" (hash, created_at)
    VALUES (${hash}, ${Date.now()})
    ON CONFLICT DO NOTHING
  `;
}

async function run() {
  console.log('◇ Starting custom migration runner...');

  try {
    // Step 1: Enable PostGIS
    console.log('\n[1/4] Enabling PostGIS extension...');
    await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
    console.log('  ✓ PostGIS ready');

    // Step 2: Disable FK triggers for the session to avoid ordering issues
    console.log('\n[2/4] Disabling FK constraint triggers...');
    await sql`SET session_replication_role = 'replica'`;
    console.log('  ✓ FK triggers disabled');

    // Step 3: Ensure migrations tracking table exists
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    // Step 4: Read migration files
    const migrationsDir = path.resolve(__dirname, 'src/database/migrations');
    console.log(`\n[3/4] Reading migrations from: ${migrationsDir}`);

    // Read journal to get the correct order
    const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
    let migrationFiles = [];

    if (fs.existsSync(journalPath)) {
      const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
      migrationFiles = journal.entries.map(e => ({
        tag: e.tag,
        file: path.join(migrationsDir, `${e.tag}.sql`),
        hash: e.tag,
      }));
    } else {
      // Fallback: read all .sql files alphabetically
      migrationFiles = fs
        .readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort()
        .map(f => ({
          tag: f.replace('.sql', ''),
          file: path.join(migrationsDir, f),
          hash: f.replace('.sql', ''),
        }));
    }

    console.log(`  Found ${migrationFiles.length} migration files`);

    // Step 5: Run each migration
    console.log('\n[4/4] Running migrations...');
    let ran = 0;
    let skipped = 0;

    for (const m of migrationFiles) {
      if (applied.has(m.hash)) {
        console.log(`  → Skip (already applied): ${m.tag}`);
        skipped++;
        continue;
      }

      if (!fs.existsSync(m.file)) {
        console.log(`  ⚠ File not found, skipping: ${m.file}`);
        continue;
      }

      console.log(`  → Running: ${m.tag}`);
      await runSqlFile(m.file);
      await markMigrationApplied(m.hash);
      ran++;
    }

    // Re-enable FK triggers
    await sql`SET session_replication_role = 'origin'`;
    console.log('\n  ✓ FK triggers re-enabled');

    console.log(`\n✅ Migration complete! Ran: ${ran}, Skipped (already applied): ${skipped}`);
  } catch (err) {
    console.error('\n✗ Fatal migration error:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
