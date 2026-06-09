const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const files = ['0002_military_marauders.sql', '0003_motionless_vance_astro.sql'];
  for (const file of files) {
      const sql = fs.readFileSync(`src/database/migrations/${file}`, 'utf8');
      const lines = sql.split('--> statement-breakpoint');
      for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
              await client.query(trimmed);
              console.log("Success:", trimmed.substring(0, 80));
          } catch(e) {
              console.error("Skipped:", trimmed.substring(0, 80), "-", e.message);
          }
      }
  }
  await client.end();
}
run();
