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

async function verifyMigration() {
  console.log('🔍 Verifying Stage 10 Migration Status\n');
  
  try {
    console.log('✅ Connected to database\n');

    // 1. Check tournament_divisions table
    console.log('=== TABLE STRUCTURE ===');
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'tournament_divisions'
      );
    `;
    console.log(`tournament_divisions table: ${tableExists[0].exists ? '✅ EXISTS' : '❌ MISSING'}`);

    if (tableExists[0].exists) {
      const columns = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'tournament_divisions'
        ORDER BY ordinal_position;
      `;
      console.log('Columns:');
      columns.forEach((col) => console.log(`  - ${col.column_name}: ${col.data_type}`));
    }

    // 2. Check FK columns
    console.log('\n=== FOREIGN KEY COLUMNS ===');

    const partCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tournament_participants' AND column_name = 'tournament_division_id'
      );
    `;
    console.log(`tournament_participants.tournament_division_id: ${partCheck[0].exists ? '✅ EXISTS' : '❌ MISSING'}`);

    const stageCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tournament_stages' AND column_name = 'tournament_division_id'
      );
    `;
    console.log(`tournament_stages.tournament_division_id: ${stageCheck[0].exists ? '✅ EXISTS' : '❌ MISSING'}`);

    // 3. Data counts
    console.log('\n=== DATA STATISTICS ===');
    const divCount = await sql`SELECT COUNT(*) as count FROM "tournament_divisions";`;
    console.log(`Total divisions: ${divCount[0].count}`);

    const parentCount = await sql`SELECT COUNT(*) as count FROM "tournaments" WHERE "parent_id" IS NOT NULL;`;
    console.log(`Tournaments with parent_id: ${parentCount[0].count}`);

    if (partCheck[0].exists) {
      const partCount = await sql`
        SELECT COUNT(*) as count FROM "tournament_participants" WHERE "tournament_division_id" IS NOT NULL;
      `;
      console.log(`Participants with division_id: ${partCount[0].count}`);
    }

    if (stageCheck[0].exists) {
      const stageCount = await sql`
        SELECT COUNT(*) as count FROM "tournament_stages" WHERE "tournament_division_id" IS NOT NULL;
      `;
      console.log(`Stages with division_id: ${stageCount[0].count}`);
    }

    // 4. Orphan check
    console.log('\n=== DATA INTEGRITY ===');
    if (partCheck[0].exists) {
      const orphanPart = await sql`
        SELECT COUNT(*) as count FROM "tournament_participants" 
        WHERE "tournament_division_id" IS NOT NULL 
        AND "tournament_division_id" NOT IN (SELECT "id" FROM "tournament_divisions")
      `;
      console.log(`Orphaned participants: ${orphanPart[0].count} ${Number(orphanPart[0].count) === 0 ? '✅' : '❌'}`);
    }

    if (stageCheck[0].exists) {
      const orphanStage = await sql`
        SELECT COUNT(*) as count FROM "tournament_stages" 
        WHERE "tournament_division_id" IS NOT NULL 
        AND "tournament_division_id" NOT IN (SELECT "id" FROM "tournament_divisions")
      `;
      console.log(`Orphaned stages: ${orphanStage[0].count} ${Number(orphanStage[0].count) === 0 ? '✅' : '❌'}`);
    }

    // 5. Sample data
    console.log('\n=== SAMPLE DATA ===');
    if (tableExists[0].exists && Number(divCount[0].count) > 0) {
      const sample = await sql`
        SELECT id, tournament_id, name, match_type, gender_restriction 
        FROM "tournament_divisions" LIMIT 3;
      `;
      console.log('Sample divisions:');
      sample.forEach((row, idx) => {
        console.log(`  ${idx + 1}. ID: ${row.id.substring(0, 8)}... | Tournament: ${row.tournament_id.substring(0, 8)}... | Name: ${row.name} | Type: ${row.match_type}`);
      });
    }

    console.log('\n✅ Verification Complete!\n');

  } catch (err) {
    console.error('\n❌ Verification Error:', err.message);
    process.exitCode = 1;

  } finally {
    await sql.end();
  }
}

verifyMigration();
