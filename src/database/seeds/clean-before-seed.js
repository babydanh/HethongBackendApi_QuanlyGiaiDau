const { drizzle } = require('drizzle-orm/postgres-js');
const { sql } = require('drizzle-orm');
const postgres = require('postgres');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const host = process.env.DB_HOST;
const port = process.env.DB_PORT || 5432;
const username = process.env.DB_USERNAME;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_DATABASE;

if (!host || !username || !password || !database) {
  console.error("Database connection variables are missing in env");
  process.exit(1);
}

const connectionString = `postgres://${username}:${password}@${host}:${port}/${database}`;
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client);

async function clean() {
  try {
    console.log('Truncating tables categories and user_to_roles...');
    // Truncate cascade để dọn dẹp sạch categories cũ tránh conflict unique constraint
    await db.execute(sql`TRUNCATE TABLE categories CASCADE;`);
    console.log('Successfully truncated categories.');
  } catch (err) {
    console.error('Error truncating:', err.message);
  } finally {
    await client.end();
  }
}

clean();
