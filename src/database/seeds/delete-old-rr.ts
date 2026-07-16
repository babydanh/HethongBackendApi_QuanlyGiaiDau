import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { eq, inArray } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';

const sqlClient = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(sqlClient, { schema });

async function deleteRoundRobinTournaments() {
  console.log('🔄 Bắt đầu tìm kiếm các giải đấu Round Robin để xóa...');

  // 1. Tìm tất cả tournaments
  const allTournaments = await db.select().from(schema.tournaments);
  
  // Lọc ra các giải đấu có bracketType là 'round_robin'
  const rrTournaments = allTournaments.filter(t => {
    const config = t.tournamentConfig as any;
    return config && config.bracketType === 'round_robin';
  });

  if (rrTournaments.length === 0) {
    console.log('✅ Không tìm thấy giải đấu Round Robin nào cũ cần xóa.');
    await sqlClient.end();
    return;
  }

  const rrIds = rrTournaments.map(t => t.id);
  console.log(`🔍 Tìm thấy ${rrIds.length} giải đấu Round Robin cũ cần xóa:`);
  rrTournaments.forEach(t => console.log(`  - [${t.id}] ${t.name}`));

  // 2. Tiến hành xóa theo thứ tự để tránh lỗi ràng buộc ngoại khóa (Foreign Key Constraints)
  console.log('🗑️ Đang xóa dữ liệu liên quan từ các trận đấu...');
  
  // Lấy danh sách trận đấu thuộc các giải này
  const matches = await db.select()
    .from(schema.matches)
    .where(inArray(schema.matches.tournamentId, rrIds));
  
  if (matches.length > 0) {
    const matchIds = matches.map(m => m.id);
    
    // Xóa các bảng liên quan đến trận đấu
    await db.delete(schema.matchDisputes)
      .where(inArray(schema.matchDisputes.matchId, matchIds));

    await db.delete(schema.matchPlayers)
      .where(inArray(schema.matchPlayers.matchId, matchIds));
      
    // Xóa matches
    await db.delete(schema.matches)
      .where(inArray(schema.matches.tournamentId, rrIds));
    console.log(`  - Đã xóa ${matches.length} trận đấu.`);
  }

  // Xóa các bảng liên quan đến người tham gia giải
  const participants = await db.select()
    .from(schema.tournamentParticipants)
    .where(inArray(schema.tournamentParticipants.tournamentId, rrIds));

  if (participants.length > 0) {
    const participantIds = participants.map(p => p.id);
    
    await db.delete(schema.tournamentRosters)
      .where(inArray(schema.tournamentRosters.participantId, participantIds));
      
    await db.delete(schema.groupStandings)
      .where(inArray(schema.groupStandings.participantId, participantIds));
  }

  await db.delete(schema.tournamentParticipants)
    .where(inArray(schema.tournamentParticipants.tournamentId, rrIds));
  console.log('  - Đã xóa thông tin người tham gia giải đấu (Participants & Rosters).');

  // Xóa theo dõi giải đấu
  await db.delete(schema.tournamentFollows)
    .where(inArray(schema.tournamentFollows.tournamentId, rrIds));

  // Xóa Staff và trọng tài giải đấu
  await db.delete(schema.tournamentStaff)
    .where(inArray(schema.tournamentStaff.tournamentId, rrIds));
    
  await db.delete(schema.tournamentReferees)
    .where(inArray(schema.tournamentReferees.tournamentId, rrIds));

  // Xóa Groups và Stages giải đấu
  const stages = await db.select()
    .from(schema.tournamentStages)
    .where(inArray(schema.tournamentStages.tournamentId, rrIds));
    
  if (stages.length > 0) {
    const stageIds = stages.map(s => s.id);
    
    await db.delete(schema.tournamentGroups)
      .where(inArray(schema.tournamentGroups.stageId, stageIds));
  }

  await db.delete(schema.tournamentStages)
    .where(inArray(schema.tournamentStages.tournamentId, rrIds));
  console.log('  - Đã xóa các vòng đấu (Stages) và Bảng đấu (Groups).');

  // Xóa division của giải đấu
  await db.delete(schema.tournamentDivisions)
    .where(inArray(schema.tournamentDivisions.tournamentId, rrIds));
  console.log('  - Đã xóa các phân hạng (Divisions) giải đấu.');

  // Cuối cùng xóa các giải đấu tournaments
  await db.delete(schema.tournaments)
    .where(inArray(schema.tournaments.id, rrIds));
  console.log(`🎉 Đã xóa hoàn toàn thành công ${rrIds.length} giải đấu Round Robin cũ!`);

  await sqlClient.end();
}

deleteRoundRobinTournaments().catch(err => {
  console.error('❌ Lỗi khi thực hiện xóa giải đấu:', err);
  sqlClient.end();
});
