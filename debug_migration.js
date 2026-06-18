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
    // Check if table exists
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'tournament_divisions'
      );
    `;
    console.log('tournament_divisions exists:', tableExists[0].exists);

    if (tableExists[0].exists) {
      // Get count
      const count = await sql`SELECT COUNT(*) FROM "tournament_divisions";`;
      console.log('Count:', count[0].count);

      // Try a single insert
      console.log('\nAttempting to get tournament data...');
        const tournaments = await sql`
          SELECT id, parent_id, name, match_type
          FROM "tournaments" 
          WHERE "parent_id" IS NOT NULL 
          LIMIT 3
        `;
        
        console.log('Sample tournaments to migrate:');
        tournaments.forEach((t) => {
          console.log(`  ID: ${t.id.substring(0, 8)}... Parent: ${t.parent_id.substring(0, 8)}... Name: ${t.name}`);
        });

        // Check if parent_id references exist
        console.log('\nChecking parent references...');
        const parents = await sql`
          SELECT DISTINCT t.parent_id
          FROM tournaments t
          WHERE t.parent_id IS NOT NULL
          LIMIT 1
        `;

        if (parents.length > 0) {
          const parentId = parents[0].parent_id;
          console.log(`Parent ID: ${parentId}`);

          const parentExists = await sql`
            SELECT EXISTS (SELECT 1 FROM "parent_tournaments" WHERE id = ${parentId})
          `;
          console.log(`Parent exists in parent_tournaments: ${parentExists[0].exists}`);

          const inTournaments = await sql`
            SELECT COUNT(*) FROM tournaments WHERE id = ${parentId}
          `;
          console.log(`This ID found in tournaments: ${inTournaments[0].count}`);
        }

        // Try direct insert
        console.log('\nTrying single test insert...');
        try {
          await sql`
            INSERT INTO "tournament_divisions" 
            ("id", "tournament_id", "name", "match_type", "status")
            VALUES (gen_random_uuid(), ${parents[0].parent_id}, 'Test Div', 'DOUBLES', 'DRAFT')
          `;
          console.log('✅ Insert succeeded');
        } catch (err) {
          console.log('❌ Insert failed:', err.message);
          console.log('Code:', err.code);
        }
      }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sql.end();
  }
}

debug();
