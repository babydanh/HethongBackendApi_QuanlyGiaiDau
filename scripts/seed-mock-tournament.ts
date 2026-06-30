import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/database/schema';
import { createPostgresClientFromEnv } from '../src/database/postgres-client';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';

const sql = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(sql, { schema });

async function main() {
  console.log('Bắt đầu khởi tạo dữ liệu giả lập giải đấu...');
  
  // 1. Tìm hoặc tạo user macter.970@gmail.com
  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, 'macter.970@gmail.com')).limit(1);
  if (!user) {
    console.log('Tạo mới user macter.970@gmail.com...');
    [user] = await db.insert(schema.users).values({
      email: 'macter.970@gmail.com',
      isEmailVerified: true,
      isMock: false,
    }).returning();
    await db.insert(schema.profiles).values({
      userId: user.id,
      fullName: 'Master Macter',
    });
  } else {
    console.log('Đã tìm thấy user macter.970@gmail.com');
  }

  // 2. Lấy category tennis
  let [category] = await db.select().from(schema.categories).where(eq(schema.categories.slug, 'tennis')).limit(1);
  if (!category) {
     [category] = await db.select().from(schema.categories).limit(1);
  }

  if (!category) {
    throw new Error('Chưa có danh mục thể thao nào. Hãy chạy seed categories trước!');
  }

  // 3. Tạo Parent Tournament
  const [parent] = await db.insert(schema.parentTournaments).values({
    name: 'Hệ thống giải đấu thử nghiệm',
    createdBy: user.id,
    sports: ['tennis']
  }).returning();

  // 4. Tạo Tournament "Đang thi đấu" (IN_PROGRESS)
  const [tournament] = await db.insert(schema.tournaments).values({
    parentId: parent.id,
    categoryId: category.id,
    createdBy: user.id,
    name: 'Giải Quần Vợt Tranh Cúp Mùa Hè 2026',
    status: 'IN_PROGRESS',
    matchType: 'SINGLES',
    tournamentType: 'PUBLIC',
    visibility: 'PUBLIC',
    startDate: new Date(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    registrationStartDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    registrationEndDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    sportRules: (category.categoryConfig as Record<string, any>)?.defaultSportRules || {},
    tournamentConfig: {
      bracketFormat: 'SINGLE_ELIMINATION',
    }
  }).returning();
  
  console.log(`Đã tạo giải đấu thành công: ${tournament.id} - ${tournament.name}`);

  // 5. Tạo 2 Divisions
  const divisions = await db.insert(schema.tournamentDivisions).values([
    {
      tournamentId: tournament.id,
      name: 'Đơn Nam',
      matchType: 'SINGLES',
      bracketType: 'SINGLE_ELIMINATION',
      genderRestriction: 'MALE',
      maxParticipants: 16,
      startDate: new Date(),
    },
    {
      tournamentId: tournament.id,
      name: 'Đôi Nam',
      matchType: 'DOUBLES',
      bracketType: 'SINGLE_ELIMINATION',
      genderRestriction: 'MALE',
      maxParticipants: 16,
      startDate: new Date(),
    }
  ]).returning();

  // 6. Xếp đội & Sơ đồ nhánh đấu cho từng Division
  for (const division of divisions) {
     console.log(`Đang tạo dữ liệu cho nhánh đấu: ${division.name}...`);
     const pIds: string[] = [];
     for(let i = 1; i <= 16; i++) {
        const [participant] = await db.insert(schema.tournamentParticipants).values({
            tournamentId: tournament.id,
            tournamentDivisionId: division.id,
            registeredBy: user.id,
            teamName: `Đội ${division.name} - Hạt giống ${i}`,
            teamStatus: 'COMPLETE',
            isPaid: true,
            isMock: true,
            seed: i
        }).returning();
        pIds.push(participant.id);
     }

     // Tạo stage & group
     const [stage] = await db.insert(schema.tournamentStages).values({
        tournamentId: tournament.id,
        tournamentDivisionId: division.id,
        name: 'Vòng Knockout',
        type: 'SINGLE_ELIMINATION',
        order: 1
     }).returning();

     const [group] = await db.insert(schema.tournamentGroups).values({
        stageId: stage.id,
        name: 'Main Bracket'
     }).returning();

     // Sơ đồ Single Elimination cho 16 đội gồm 4 vòng: R16 (8 trận), QF (4 trận), SF (2 trận), Chung kết (1 trận).
     const r16 = Array.from({length: 8}, () => randomUUID());
     const r8 = Array.from({length: 4}, () => randomUUID());
     const r4 = Array.from({length: 2}, () => randomUUID());
     const r2 = randomUUID();

     const matchesToInsert = [
        // Vòng 1/8 (Round 1)
        { id: r16[0], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 1, matchOrder: 1, status: 'COMPLETED', participant1Id: pIds[0], participant2Id: pIds[15], winnerId: pIds[0], p1SetsWon: 2, p2SetsWon: 0, totalSetsPlayed: 2, nextMatchId: r8[0] },
        { id: r16[1], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 1, matchOrder: 2, status: 'COMPLETED', participant1Id: pIds[7], participant2Id: pIds[8], winnerId: pIds[7], p1SetsWon: 2, p2SetsWon: 1, totalSetsPlayed: 3, nextMatchId: r8[0] },
        { id: r16[2], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 1, matchOrder: 3, status: 'COMPLETED', participant1Id: pIds[3], participant2Id: pIds[12], winnerId: pIds[3], p1SetsWon: 2, p2SetsWon: 0, totalSetsPlayed: 2, nextMatchId: r8[1] },
        { id: r16[3], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 1, matchOrder: 4, status: 'COMPLETED', participant1Id: pIds[4], participant2Id: pIds[11], winnerId: pIds[4], p1SetsWon: 2, p2SetsWon: 1, totalSetsPlayed: 3, nextMatchId: r8[1] },
        { id: r16[4], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 1, matchOrder: 5, status: 'COMPLETED', participant1Id: pIds[1], participant2Id: pIds[14], winnerId: pIds[1], p1SetsWon: 2, p2SetsWon: 0, totalSetsPlayed: 2, nextMatchId: r8[2] },
        { id: r16[5], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 1, matchOrder: 6, status: 'COMPLETED', participant1Id: pIds[6], participant2Id: pIds[9], winnerId: pIds[6], p1SetsWon: 2, p2SetsWon: 0, totalSetsPlayed: 2, nextMatchId: r8[2] },
        { id: r16[6], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 1, matchOrder: 7, status: 'COMPLETED', participant1Id: pIds[2], participant2Id: pIds[13], winnerId: pIds[2], p1SetsWon: 2, p2SetsWon: 1, totalSetsPlayed: 3, nextMatchId: r8[3] },
        { id: r16[7], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 1, matchOrder: 8, status: 'COMPLETED', participant1Id: pIds[5], participant2Id: pIds[10], winnerId: pIds[5], p1SetsWon: 2, p2SetsWon: 0, totalSetsPlayed: 2, nextMatchId: r8[3] },
        
        // Tứ kết (Round 2)
        { id: r8[0], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 2, matchOrder: 1, status: 'COMPLETED', participant1Id: pIds[0], participant2Id: pIds[7], winnerId: pIds[0], p1SetsWon: 2, p2SetsWon: 0, totalSetsPlayed: 2, nextMatchId: r4[0] },
        { id: r8[1], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 2, matchOrder: 2, status: 'COMPLETED', participant1Id: pIds[3], participant2Id: pIds[4], winnerId: pIds[3], p1SetsWon: 2, p2SetsWon: 1, totalSetsPlayed: 3, nextMatchId: r4[0] },
        { id: r8[2], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 2, matchOrder: 3, status: 'COMPLETED', participant1Id: pIds[1], participant2Id: pIds[6], winnerId: pIds[1], p1SetsWon: 2, p2SetsWon: 0, totalSetsPlayed: 2, nextMatchId: r4[1] },
        { id: r8[3], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 2, matchOrder: 4, status: 'COMPLETED', participant1Id: pIds[2], participant2Id: pIds[5], winnerId: pIds[2], p1SetsWon: 2, p2SetsWon: 0, totalSetsPlayed: 2, nextMatchId: r4[1] },

        // Bán kết (Round 3)
        { id: r4[0], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 3, matchOrder: 1, status: 'ONGOING', participant1Id: pIds[0], participant2Id: pIds[3], winnerId: null, p1SetsWon: 1, p2SetsWon: 0, totalSetsPlayed: 1, nextMatchId: r2 },
        { id: r4[1], stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 3, matchOrder: 2, status: 'SCHEDULED', participant1Id: pIds[1], participant2Id: pIds[2], winnerId: null, p1SetsWon: 0, p2SetsWon: 0, totalSetsPlayed: 0, nextMatchId: r2 },
        
        // Chung kết (Round 4)
        { id: r2, stageId: stage.id, groupId: group.id, tournamentId: tournament.id, roundNumber: 4, matchOrder: 1, status: 'SCHEDULED', participant1Id: null, participant2Id: null, winnerId: null, p1SetsWon: 0, p2SetsWon: 0, totalSetsPlayed: 0, nextMatchId: null },
     ];

     await db.insert(schema.matches).values(matchesToInsert as any);
  }

  console.log(`===============================================`);
  console.log(`HOÀN TẤT SEEDING!`);
  console.log(`Tournament ID: ${tournament.id}`);
  console.log(`User email: ${user.email}`);
  console.log(`===============================================`);
  
  await sql.end();
}

main().catch(async (err) => {
  console.error('Lỗi khi seed data:', err);
  await sql.end();
  process.exit(1);
});
