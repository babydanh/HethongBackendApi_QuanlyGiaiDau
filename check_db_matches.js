const postgres = require('postgres');
require('dotenv').config();

const sql = postgres({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  ssl: 'require'
});

async function main() {
  try {
    const tournamentId = '3b81d998-8c05-40a8-b2d3-8e674db5aae2';
    const participants = await sql`
      select id, team_name, seed
      from tournament_participants
      where tournament_id = ${tournamentId}
      order by id
    `;
    console.log('Participants of tournament:', participants);
  } catch (err) {
    console.error(err);
  } finally {
    await sql.end();
  }
}

main();
