import { drizzle } from 'drizzle-orm/postgres-js';
import * as dotenv from 'dotenv';
import { createPostgresClientFromEnv } from '../postgres-client';
import { 
  tournaments, 
  parentTournaments, 
  matches, 
  tournamentParticipants, 
  tournamentStages, 
  tournamentGroups, 
  tournamentDivisions,
  livestreamCameras,
  payments,
} from '../schema';

dotenv.config();

async function clearTournaments() {
  console.log('⚠️ Bắt đầu xoá tất cả giải đấu...');
  const sql = createPostgresClientFromEnv();
  const db = drizzle(sql);

  try {
    // Xoá các bảng con dính khóa ngoại (Foreign key) trước
    await db.delete(payments);
    await db.delete(matches);
    await db.delete(tournamentParticipants);
    await db.delete(tournamentGroups);
    await db.delete(tournamentStages);
    await db.delete(tournamentDivisions);
    await db.delete(livestreamCameras);
    
    // Xoá tất cả tournaments
    await db.delete(tournaments);
    await db.delete(parentTournaments);

    console.log('✅ Đã xoá thành công toàn bộ giải đấu trên Database!');
  } catch (error) {
    console.error('❌ Lỗi khi xoá giải đấu:', error);
  } finally {
    await sql.end();
  }
}

clearTournaments().catch(console.error);
