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

async function checkDatabaseState() {
  console.log('🔍 Checking Database State\n');
  
  try {
    console.log('✅ Connected to database\n');

    // Check parent_tournaments table
    console.log('=== PARENT_TOURNAMENTS ===');
    const parentCount = await sql`SELECT COUNT(*) as count FROM "parent_tournaments";`;
    console.log(`Total parent tournaments: ${parentCount[0].count}`);

    if (Number(parentCount[0].count) > 0) {
      const samples = await sql`SELECT id, name FROM "parent_tournaments" LIMIT 3;`;
      console.log('Sample parent tournaments:');
      samples.forEach((row) => console.log(`  - ${row.id.substring(0, 8)}...: ${row.name}`));
    }

    // Check tournaments with parent_id
    console.log('\n=== TOURNAMENTS WITH PARENT_ID ===');
    const withParent = await sql`SELECT COUNT(*) as count FROM "tournaments" WHERE "parent_id" IS NOT NULL;`;
    console.log(`Tournaments with parent_id: ${withParent[0].count}`);

    if (Number(withParent[0].count) > 0) {
      const orphanParents = await sql`
        SELECT DISTINCT t."parent_id"
        FROM "tournaments" t
        WHERE t."parent_id" IS NOT NULL
        AND t."parent_id" NOT IN (SELECT "id" FROM "parent_tournaments")
      `;
      console.log(`Tournament references to missing parent_tournaments: ${orphanParents.length}`);
      if (orphanParents.length > 0) {
        console.log('Missing parent IDs:');
        orphanParents.slice(0, 5).forEach((row) => console.log(`  - ${row.parent_id}`));
      }
    }

    // Check regular tournaments (no parent)
    console.log('\n=== REGULAR TOURNAMENTS (NO PARENT) ===');
    const noParent = await sql`SELECT COUNT(*) as count FROM "tournaments" WHERE "parent_id" IS NULL;`;
    console.log(`Tournaments without parent_id: ${noParent[0].count}`);

    if (Number(noParent[0].count) > 0) {
      const samples = await sql`SELECT id, name, category_id FROM "tournaments" WHERE "parent_id" IS NULL LIMIT 3;`;
      console.log('Sample tournaments without parent:');
      samples.forEach((row) => console.log(`  - ${row.id.substring(0, 8)}...: ${row.name}`));
    }

    // Check existing divisions
    console.log('\n=== TOURNAMENT_DIVISIONS ===');
    const divCount = await sql`SELECT COUNT(*) as count FROM "tournament_divisions";`;
    console.log(`Total divisions: ${divCount[0].count}`);

    if (Number(divCount[0].count) > 0) {
      const samples = await sql`SELECT id, tournament_id, name FROM "tournament_divisions" LIMIT 3;`;
      console.log('Sample divisions:');
      samples.forEach((row) => console.log(`  - ${row.id.substring(0, 8)}...: ${row.name}`));
    }

    // Understanding the schema
    console.log('\n=== SCHEMA UNDERSTANDING ===');
    const parentTourCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'parent_tournaments'
      );
    `;
    console.log(`parent_tournaments table exists: ${parentTourCheck[0].exists}`);

    console.log('\n✅ Database state check complete!\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exitCode = 1;

  } finally {
    await sql.end();
  }
}

checkDatabaseState();
