import { db } from '../index';
import { 
  tournaments, 
  parentTournaments, 
  matches, 
  tournamentParticipants, 
  tournamentStages, 
  tournamentGroups, 
  tournamentDivisions,
  livestreams 
} from '../schema';

async function clearTournaments() {
  console.log('⚠️ Bắt đầu xoá tất cả giải đấu...');

  try {
    // Xoá các bảng con trước
    await db.delete(matches);
    await db.delete(tournamentParticipants);
    await db.delete(tournamentGroups);
    await db.delete(tournamentStages);
    await db.delete(tournamentDivisions);
    await db.delete(livestreams);
    
    // Xoá tất cả tournaments
    await db.delete(tournaments);
    await db.delete(parentTournaments);

    console.log('✅ Đã xoá thành công toàn bộ giải đấu trên Database!');
  } catch (error) {
    console.error('❌ Lỗi khi xoá giải đấu:', error);
  } finally {
    process.exit(0);
  }
}

clearTournaments();
