import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function run() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'your_password',
    database: process.env.DB_DATABASE || 'tournament_db',
    ssl: { rejectUnauthorized: false },
  });

  const sql = fs.readFileSync(path.resolve(__dirname, './migrations/0007_next_purifiers.sql'), 'utf-8');
  
  try {
    console.log('Running migration...');
    await pool.query(sql);
    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

run();
