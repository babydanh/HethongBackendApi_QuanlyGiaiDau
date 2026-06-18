require('dotenv').config();
const postgres = require('postgres');

async function truncateMatches() {
  const sql = postgres({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
    prepare: false,
  });

  try {
    console.log('Connected to DB.');
    console.log('Truncating matches table cascade...');
    await sql.unsafe('TRUNCATE TABLE matches CASCADE;');
    console.log('✅ Truncated successfully!');
  } catch (err) {
    console.error('Error truncating matches:', err.message);
  } finally {
    await sql.end();
  }
}

truncateMatches();
