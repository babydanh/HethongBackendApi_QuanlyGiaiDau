/**
 * run-prod-migration.js
 * Pure CommonJS migration runner — no TypeScript, no ts-node needed.
 * Tắt FK constraints tạm thời để chạy migrations không bị lỗi thứ tự.
 */
'use strict';

const path = require('path');
const fs = require('fs');

// Load env
const envFile = path.resolve(__dirname, '.env');
if (fs.existsSync(envFile)) {
  require('dotenv').config({ path: envFile });
} else {
  // Try parent .env
  require('dotenv').config();
}

const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { migrate } = require('drizzle-orm/postgres-js/migrator');

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
  idle_timeout: 60,
  connect_timeout: 30,
  connection: {
    search_path: 'public',
  },
});

async function run() {
  try {
    console.log('◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }');
    console.log('Running migration...');

    // Kích hoạt PostGIS
    console.log('Enabling PostGIS extension...');
    await sql`CREATE EXTENSION IF NOT EXISTS postgis;`;

    // Tắt kiểm tra FK tạm thời để migration chạy không bị lỗi thứ tự bảng
    console.log('Disabling FK constraints for migration session...');
    await sql`SET session_replication_role = 'replica';`;
    await sql`SET CONSTRAINTS ALL DEFERRED;`;

    const db = drizzle(sql);

    // Thư mục migrations được mount từ host vào /app/src/database/migrations
    const migrationsFolder = path.resolve(__dirname, 'src/database/migrations');
    console.log(`Migrations folder: ${migrationsFolder}`);

    await migrate(db, { migrationsFolder });

    // Bật lại FK constraints
    await sql`SET session_replication_role = 'origin';`;

    console.log('Migration complete! ✅');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
