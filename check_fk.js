require('dotenv').config();
const postgres = require('postgres');

const sql = postgres({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
  prepare: false,
});

async function debug() {
  try {
    // Get FK constraints
    console.log('FK constraints on tournament_divisions:\n');
    const fks = await sql`
      SELECT 
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu ON tc.table_name = kcu.table_name AND tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'tournament_divisions'
      AND tc.constraint_type = 'FOREIGN KEY'
    `;

    fks.forEach((row) => {
      console.log(`${row.constraint_name}:`);
      console.log(`  Column: ${row.column_name}`);
      console.log(`  References: ${row.foreign_table_name}.${row.foreign_column_name}`);
    });

    console.log('\n\nColumn details:');
    const cols = await sql`
      SELECT column_name, data_type FROM information_schema.columns 
      WHERE table_name = 'tournament_divisions'
    `;
    cols.forEach((col) => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sql.end();
  }
}

debug();
