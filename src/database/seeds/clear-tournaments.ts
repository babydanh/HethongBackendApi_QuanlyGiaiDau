import { drizzle } from 'drizzle-orm/postgres-js';
import * as dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';

dotenv.config();

async function clearTournaments() {
  console.log('⚠️ Bắt đầu xoá tất cả giải đấu...');
  const client = createPostgresClientFromEnv();
  const db = drizzle(client);

  try {
    await db.execute(
      sql`TRUNCATE TABLE tournaments, parent_tournaments, matches, tournament_participants, tournament_stages, tournament_groups, tournament_divisions, livestream_cameras, payments, payment_status_logs CASCADE;`
    );
    console.log('✅ Đã xoá thành công toàn bộ giải đấu và dữ liệu liên quan trên Database!');
  } catch (error) {
    console.error('❌ Lỗi khi xoá giải đấu:', error);
  } finally {
    await client.end();
  }
}

clearTournaments().catch(console.error);
