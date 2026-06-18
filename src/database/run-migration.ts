import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { createPostgresClientFromEnv } from './postgres-client';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function run() {
  const sql = createPostgresClientFromEnv({
    max: 1,
  });

  const migrationSql = fs.readFileSync(
    path.resolve(__dirname, './migrations/0007_next_purifiers.sql'),
    'utf-8',
  );
  
  try {
    console.log('Running migration...');
    await sql.unsafe(migrationSql);
    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await sql.end();
  }
}

run();
