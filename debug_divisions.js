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
    console.log('Checking tournament_divisions data:\n');

    // Get divisions
    const divs = await sql`
      SELECT id, tournament_id, name, match_type, gender_restriction FROM "tournament_divisions"
    `;
    console.log(`Total divisions: ${divs.length}\n`);
    divs.forEach((row) => {
      console.log(`ID: ${row.id.substring(0, 8)}...`);
      console.log(`  Tournament: ${row.tournament_id.substring(0, 8)}...`);
      console.log(`  Name: ${row.name}`);
      console.log(`  Type: ${row.match_type}, Gender: ${row.gender_restriction || 'ANY'}\n`);
    });

    // Check which tournaments with parent_id should have been migrated
    console.log('\nTournaments that should be divisions (parent_id IS NOT NULL):');
    const should = await sql`
      SELECT id, name, parent_id, match_type, gender_restriction FROM "tournaments" 
      WHERE "parent_id" IS NOT NULL AND "deleted_at" IS NULL
      ORDER BY "parent_id", "created_at"
      LIMIT 10
    `;

    console.log(`Total to migrate: ${should.length} shown\n`);
    should.forEach((row) => {
      console.log(`ID: ${row.id.substring(0, 8)}... Name: ${row.name} | Parent: ${row.parent_id.substring(0, 8)}... | Type: ${row.match_type} | Gender: ${row.gender_restriction || 'ANY'}`);
    });

    // Check if there are duplicates based on unique constraint
    console.log('\nChecking for duplicate (tournament_id, match_type, gender_restriction):');
    const dups = await sql`
      SELECT 
        tournament_id, match_type, gender_restriction,
        COUNT(*) as cnt,
        STRING_AGG(id::text, ', ') as ids
      FROM "tournaments" 
      WHERE "parent_id" IS NOT NULL AND "deleted_at" IS NULL
      GROUP BY tournament_id, match_type, gender_restriction
      HAVING COUNT(*) > 1
    `;
    console.log(`Duplicates found: ${dups.length}`);
    dups.forEach((row) => {
      console.log(`  Tournament: ${row.tournament_id.substring(0, 8)}... Type: ${row.match_type} Gender: ${row.gender_restriction} - Count: ${row.cnt}`);
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sql.end();
  }
}

debug();
