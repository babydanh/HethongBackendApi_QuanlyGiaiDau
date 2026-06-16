import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as dotenv from 'dotenv';
import { createPostgresClientFromEnv } from './src/database/postgres-client';

dotenv.config();

async function run() {
  const sql = createPostgresClientFromEnv({
    max: 1,
  });
  try {
    console.log('Enabling PostGIS...');
    await sql`CREATE EXTENSION IF NOT EXISTS postgis;`;
    const db = drizzle(sql);

    console.log('Running migrations...');
    await migrate(db, { migrationsFolder: './src/database/migrations' });
    console.log('Migrations complete!');
  } finally {
    await sql.end();
  }
}

run().catch(console.error);
