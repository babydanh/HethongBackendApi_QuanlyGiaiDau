const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected");
    try {
      await client.query('select "id", "community_id", "category_id", "created_by", "name", "description", "status", "match_type", "sport_rules", "tournament_config", "entry_fee", "platform_fee_percentage", "registration_start_date", "registration_end_date", "max_participants", "start_date", "end_date", "venue_id", "created_at", "updated_at", "deleted_at" from "tournaments" limit 1');
      console.log("Query tournaments succeeded");
    } catch(e) {
      console.error("Tournaments Error:", e.message);
    }
    
    try {
      await client.query('select "id", "name", "description", "logo_url", "banner_url", "creator_id", "status", "approved_by", "rejected_reason", "reviewed_at", "location_geolocation", "location_address", "social_links", "created_at", "updated_at", "deleted_at" from "communities" where "communities"."status" = $1 limit $2', ['APPROVED', 10]);
      console.log("Query communities succeeded");
    } catch(e) {
      console.error("Communities Error:", e.message);
    }
    
  } catch (err) {
    console.error("Connect error", err);
  } finally {
    await client.end();
  }
}
run();
