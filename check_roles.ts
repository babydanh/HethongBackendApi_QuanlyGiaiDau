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
    const res = await client.query('SELECT * FROM roles');
    console.log("Roles:", res.rows);
  } finally {
    client.release();
    pool.end();
  }
}
run().catch(console.error);
