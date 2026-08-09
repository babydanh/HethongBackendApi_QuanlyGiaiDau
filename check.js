const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:your_password@127.0.0.1:5433/tournament_db' });
client.connect().then(() => 
  client.query("SELECT id, name, status FROM tournaments WHERE status NOT IN ('REGISTRATION_OPEN', 'UPCOMING', 'ONGOING', 'COMPLETED', 'REGISTRATION_CLOSED')").then(res => {
    console.log(JSON.stringify(res.rows, null, 2));
    client.end();
  })
).catch(console.error);
