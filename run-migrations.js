const { Pool } = require('pg');
const { drizzle } = require('drizzle-orm/node-postgres');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

const db = drizzle(pool);

async function run() {
  try {
    await migrate(db, { migrationsFolder: './src/database/migrations' });
    console.log("All migrations applied!");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await pool.end();
  }
}
run();
