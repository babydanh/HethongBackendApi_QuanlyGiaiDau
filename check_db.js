const { Client } = require('pg');
const client = new Client({ 
  connectionString: 'postgres://postgres.xhamzckqefydygejljgo:Danh%40%4027122005@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres' 
});
client.connect()
  .then(() => client.query('UPDATE profiles p SET avatar_url = ap.provider_avatar_url FROM auth_providers ap WHERE p.user_id = ap.user_id AND p.avatar_url IS NULL;'))
  .then(res => { console.log('Updated', res.rowCount, 'profiles'); client.end(); })
  .catch(console.error);
