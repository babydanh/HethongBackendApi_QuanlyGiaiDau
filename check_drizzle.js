require('ts-node').register();
const { pool } = require('./src/database/database.module');
const { NodePgDatabase } = require('drizzle-orm/node-postgres');
const { drizzle } = require('drizzle-orm/node-postgres');
const schema = require('./src/database/schema');
const { eq } = require('drizzle-orm');

async function test() {
  const { Client } = require('pg');
  const client = new Client({ connectionString: 'postgres://postgres.xhamzckqefydygejljgo:Danh%40%4027122005@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres' });
  await client.connect();
  const db = drizzle(client, { schema });
  
  const result = await db.select({
    id: schema.users.id,
    profile: schema.profiles,
  }).from(schema.users)
  .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
  .limit(1);
  
  console.log(JSON.stringify(result[0], null, 2));
  client.end();
}
test();
