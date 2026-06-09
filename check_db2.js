const { Client } = require('pg');
const client = new Client({ 
  connectionString: 'postgres://postgres.xhamzckqefydygejljgo:Danh%40%4027122005@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres' 
});
client.connect()
  .then(() => client.query('SELECT u.email, p.full_name, p.avatar_url FROM users u LEFT JOIN profiles p ON u.id = p.user_id'))
  .then(res => { console.log(res.rows); client.end(); })
  .catch(console.error);
