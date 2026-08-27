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

function isSafeRepeatError(code, statement) {
  const normalized = statement.replace(/\s+/g, ' ').toUpperCase();
  if (code === '42P07' || code === '42P06' || code === '42723') {
    return (
      normalized.includes('IF NOT EXISTS') ||
      normalized.includes('CREATE TABLE') ||
      normalized.includes('CREATE INDEX') ||
      normalized.includes('CREATE UNIQUE INDEX')
    );
  }
  if (code === '42701') {
    return normalized.includes('ADD COLUMN') || normalized.includes('IF NOT EXISTS');
  }
  if (code === '42710') {
    return (
      normalized.includes('IF NOT EXISTS') ||
      normalized.includes('ADD CONSTRAINT') ||
      normalized.includes('CREATE TABLE') ||
      normalized.includes('CREATE INDEX')
    );
  }
  if (code === '42704' || code === '42703' || code === '42P01') {
    return (
      normalized.includes('IF EXISTS') ||
      normalized.includes('DISABLE ROW LEVEL SECURITY') ||
      normalized.includes('ENABLE ROW LEVEL SECURITY') ||
      normalized.includes('DROP TABLE') ||
      normalized.includes('DROP CONSTRAINT') ||
      normalized.includes('DROP INDEX') ||
      normalized.includes('DROP COLUMN')
    );
  }
  return false;
}

async function runStatement(statement) {
  const trimmed = statement.trim();
  if (!trimmed || trimmed === '') return;
  try {
    await sql.unsafe(trimmed);
  } catch (err) {
    if (isSafeRepeatError(err.code, trimmed)) {
      console.log(`  ⚠ Skipped (already satisfied): ${trimmed.substring(0, 80)}...`);
    } else {
      console.error(`  ✗ Error [${err.code}]: ${err.message}`);
      console.error(`    Statement: ${trimmed.substring(0, 120)}`);
      // Never mark a partially-applied migration as successful. Failing the
      // deploy keeps the migration retryable after the schema issue is fixed.
      throw err;
    }
  }
}

function splitSqlStatements(content) {
  if (content.includes('--> statement-breakpoint')) {
    return content.split('--> statement-breakpoint');
  }
  // Standalone SQL fallback: split by semicolon while respecting dollar-quoted blocks
  const lines = content.split('\n');
  const statements = [];
  let current = [];
  let inDollarQuote = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inDollarQuote && (trimmed.startsWith('--') || trimmed.startsWith('/*')) && current.length === 0) {
      continue;
    }
    if (line.includes('$$')) {
      const count = (line.match(/\$\$/g) || []).length;
      if (count % 2 !== 0) inDollarQuote = !inDollarQuote;
    }
    current.push(line);
    if (!inDollarQuote && trimmed.endsWith(';')) {
      statements.push(current.join('\n'));
      current = [];
    }
  }
  if (current.length > 0) {
    const remaining = current.join('\n').trim();
    if (remaining) statements.push(remaining);
  }
  return statements;
}

async function runSqlFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const statements = splitSqlStatements(content);
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
    try {
      runDryRun(migrationsDir);
    } finally {
      await sql.end();
    }
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
        throw new Error(`Migration file not found: ${m.file}`);
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
