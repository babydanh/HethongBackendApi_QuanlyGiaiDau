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
const DRY_RUN = process.argv.includes('--dry-run');

const isSSL = process.env.DB_SSL === 'true';

const sql = postgres({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'tournament_db',
  ssl: isSSL ? { rejectUnauthorized: false } : false,
  prepare: false,
  max: 1,
  idle_timeout: 120,
  connect_timeout: 30,
  connection: { search_path: 'public' },
});

// Errors that are safe to ignore (object already exists or already dropped)
const IGNORABLE_CODES = new Set([
  '42P07', // duplicate_table
  '42701', // duplicate_column
  '42710', // duplicate_object (constraint, index, extension...)
  '23505', // unique_violation (on constraint creation)
  '42P06', // duplicate_schema
  '42723', // duplicate_function
  '42704', // undefined_object (e.g. drop constraint if not exists)
  '42703', // undefined_column
  '42P01', // undefined_table (safe on conditional drops)
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
      console.error(`  ✗ Error [${err.code}]: ${err.message}`);
      console.error(`    Statement: ${trimmed.substring(0, 120)}`);
      // Never mark a partially-applied migration as successful. Failing the
      // deploy keeps the migration retryable after the schema issue is fixed.
      throw err;
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

function discoverMigrationFiles(migrationsDir) {
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    return fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => ({
        tag: file.replace('.sql', ''),
        file: path.join(migrationsDir, file),
        hash: file.replace('.sql', ''),
      }));
  }

  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const migrationFiles = journal.entries.map((entry) => ({
    tag: entry.tag,
    file: path.join(migrationsDir, `${entry.tag}.sql`),
    hash: entry.tag,
  }));

  // Keep hand-authored operational migrations in the same production
  // pipeline, even when Drizzle's journal does not include them.
  const journalTags = new Set(migrationFiles.map((migration) => migration.tag));
  const standaloneMigrations = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql') && !file.startsWith('meta'))
    .map((file) => file.replace(/\.sql$/, ''))
    .filter((tag) => !journalTags.has(tag))
    .sort()
    .map((tag) => ({
      tag,
      file: path.join(migrationsDir, `${tag}.sql`),
      hash: tag,
    }));

  return migrationFiles.concat(standaloneMigrations);
}

function runDryRun(migrationsDir) {
  const migrationFiles = discoverMigrationFiles(migrationsDir);
  console.log(`[dry-run] Found ${migrationFiles.length} migration files in ${migrationsDir}`);
  let totalStatements = 0;
  for (const migration of migrationFiles) {
    if (!fs.existsSync(migration.file)) {
      throw new Error(`[dry-run] Missing migration file: ${migration.file}`);
    }
    const statementCount = fs
      .readFileSync(migration.file, 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean).length;
    totalStatements += statementCount;
    console.log(`  → ${migration.tag} (${statementCount} statements)`);
  }
  console.log(`[dry-run] OK: ${migrationFiles.length} files, ${totalStatements} statements; database unchanged.`);
}

async function run() {
  const migrationsDir = path.resolve(__dirname, 'src/database/migrations');
  if (DRY_RUN) {
    runDryRun(migrationsDir);
    return;
  }

  console.log('◇ Starting custom migration runner...');
  let fkTriggersDisabled = false;

  try {
    // Step 1: Disable FK triggers for the session to avoid ordering issues
    console.log('\n[1/3] Disabling FK constraint triggers...');
    await sql`SET session_replication_role = 'replica'`;
    fkTriggersDisabled = true;
    console.log('  ✓ FK triggers disabled');

    // Step 2: Ensure migrations tracking table exists
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    // Step 3: Read migration files
    console.log(`\n[2/3] Reading migrations from: ${migrationsDir}`);
    const migrationFiles = discoverMigrationFiles(migrationsDir);

    console.log(`  Found ${migrationFiles.length} migration files`);

    // Step 4: Run each migration
    console.log('\n[3/3] Running migrations...');
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
    // Set the exit status but let finally restore session state and close the
    // connection before Node exits.
    process.exitCode = 1;
  } finally {
    if (fkTriggersDisabled) {
      try {
        await sql`SET session_replication_role = 'origin'`;
        console.log('  ✓ FK triggers restored after migration failure');
      } catch (restoreError) {
        console.error('  ✗ Failed to restore FK triggers before closing migration session:', restoreError);
      }
    }
    await sql.end();
  }
}

run();
