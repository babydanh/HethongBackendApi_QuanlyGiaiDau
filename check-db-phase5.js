require('dotenv').config();
const postgres = require('postgres');

async function run() {
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

    // Check tournaments columns
    const tourCols = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tournaments' AND column_name IN ('visibility', 'gender_restriction');
    `;
    console.log('Tournaments cols:', tourCols);

    // Check tournament_participants columns
    const partCols = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tournament_participants' AND column_name IN ('team_invite_token', 'team_status');
    `;
    console.log('Participants cols:', partCols);

    // Check user_ranks columns
    const rankCols = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_ranks' AND column_name = 'win_streak';
    `;
    console.log('User Ranks cols:', rankCols);

    // Check community_rankings table
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'community_rankings';
    `;
    console.log('community_rankings exists:', tables.length > 0);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sql.end();
  }
}

run();
