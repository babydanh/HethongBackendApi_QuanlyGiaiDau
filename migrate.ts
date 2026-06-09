import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();
  try {
    console.log("Enabling PostGIS...");
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
  } finally {
    client.release();
  }
  const db = drizzle(pool);
  
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: './src/database/migrations' });
  console.log("Migrations complete!");
  pool.end();
}

run().catch(console.error);
