import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import * as bcrypt from 'bcrypt';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';
import * as crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();
const sqlClient = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(sqlClient, { schema });

const VIETNAMESE_NAMES = [
  'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Hoàng Cường', 'Phạm Minh Duy',
  'Hoàng Xuân Em', 'Vũ Quốc Phong', 'Ngô Gia Huy', 'Đặng Khánh Linh',
  'Bùi Minh Trí', 'Phan Văn Nam', 'Đỗ Thùy Trang', 'Hồ Đức Hải',
  'Nguyễn Minh Quân', 'Phạm Hồng Đăng', 'Trần Bảo Long', 'Lê Quỳnh Anh',
  'Trịnh Công Sơn', 'Lý Tự Trọng', 'Võ Thị Sáu', 'Phan Bội Châu',
  'Nguyễn Du', 'Hồ Xuân Hương', 'Đoàn Thị Điểm', 'Bà Huyện Thanh Quan',
  'Tô Hiến Thành', 'Trần Hưng Đạo', 'Lý Thường Kiệt', 'Lê Lợi',
  'Nguyễn Trãi', 'Quang Trung', 'Nguyễn Huệ', 'Trần Quốc Toản',
  'Kim Đồng', 'Bùi Thị Xuân', 'Nguyễn Thái Học', 'Võ Nguyên Giáp'
];

function generateScore(winner: 1 | 2) {
  const sets: any[] = [];
  if (winner === 1) {
    sets.push({ team1Score: 21, team2Score: 15, isFinished: true });
    sets.push({ team1Score: 21, team2Score: 17, isFinished: true });
    return { p1SetsWon: 2, p2SetsWon: 0, scoreDetails: { sets } };
  } else {
    sets.push({ team1Score: 15, team2Score: 21, isFinished: true });
    sets.push({ team1Score: 17, team2Score: 21, isFinished: true });
    return { p1SetsWon: 0, p2SetsWon: 2, scoreDetails: { sets } };
  }
}

async function simulateMatches(tournamentId: string, authHeaders: any) {
  const BASE_URL = 'http://127.0.0.1:3000/api/v1';
  let iteration = 0;
  let hasPlayableMatches = true;

  while (hasPlayableMatches && iteration < 20) {
    iteration++;
    const res = await fetch(`${BASE_URL}/matches?tournamentId=${tournamentId}&limit=500`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    });
    const resData = await res.json().catch(() => ({}));
    const matches = Array.isArray(resData?.data) ? resData.data
      : Array.isArray(resData) ? resData : [];

    if (matches.length === 0) break;

    const playable = matches.filter((m: any) =>
      m.participant1?.id &&
      m.participant2?.id &&
      m.status !== 'COMPLETED' &&
      !m.isBye
    );

    if (playable.length === 0) {
      hasPlayableMatches = false;
      break;
    }

    // Nếu chỉ còn 1 trận chưa đấu (thường là trận Chung kết), chừa lại không đấu để giải đấu giữ trạng thái IN_PROGRESS
    if (playable.length === 1 && matches.filter((m: any) => m.status !== 'COMPLETED').length === 1) {
      break;
    }

    for (const match of playable) {
      // Bỏ qua nếu là trận chung kết của nhánh thắng/thua hoặc chung kết đơn để giữ giải đấu IN_PROGRESS
      // Chúng ta sẽ chừa lại trận đấu cuối cùng
      if (playable.length > 1 || match.roundNumber < 5) {
        const winnerSide = (parseInt(match.id.substring(0, 2), 16) % 2 === 0) ? 1 : 2;
        const winnerId = winnerSide === 1 ? match.participant1.id : match.participant2.id;
        const score = generateScore(winnerSide);

        await fetch(`${BASE_URL}/matches/${match.id}/score`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            p1SetsWon: score.p1SetsWon,
            p2SetsWon: score.p2SetsWon,
            winnerId,
            scoreDetails: score.scoreDetails,
          }),
        });
      }
    }
  }
}

async function createTournament(params: {
  name: string;
  bracketType: string;
  numTeams: number;
  venueId: string;
  categoryId: string;
  organizerId: string;
  matchType?: 'SINGLES' | 'DOUBLES';
  status?: string;
  groupConfig?: any;
}) {
  const { name, bracketType, numTeams, venueId, categoryId, organizerId, matchType = 'SINGLES', status = 'IN_PROGRESS', groupConfig } = params;
  const maxSlots = numTeams === 0 ? 16 : numTeams;
  const tourId = uuidv4();
  const inviteCode = `T-${bracketType.substring(0,2).toUpperCase()}-${numTeams}-${Date.now().toString().slice(-4)}`;

  await db.insert(schema.tournaments).values({
    id: tourId,
    name: name,
    categoryId: categoryId,
    createdBy: organizerId,
    status: 'IN_PROGRESS',
    matchType: matchType,
    sportRules: { kind: 'BADMINTON', setsToWin: 2, pointsPerSet: 21, winByTwo: true },
    tournamentConfig: {
      bracketType: bracketType,
      maxTeams: maxSlots,
      roundRobinLegs: bracketType === 'round_robin' ? 1 : undefined,
      groupConfig,
    },
    venueId: venueId,
    entryFee: '0',
    tournamentType: 'PUBLIC',
    visibility: 'PUBLIC',
    maxParticipants: maxSlots,
    registrationStartDate: new Date(),
    registrationEndDate: new Date(Date.now() + 30 * 86400000),
    startDate: new Date(),
    endDate: new Date(Date.now() + 60 * 86400000),
    inviteCode: inviteCode,
    isRanked: true,
  });

  const divisionId = uuidv4();
  await db.insert(schema.tournamentDivisions).values({
    id: divisionId,
    tournamentId: tourId,
    name: name,
    matchType: matchType,
    bracketType: bracketType,
    status: 'ACTIVE',
    entryFee: '0',
    roundConfig: groupConfig ? groupConfig : undefined,
  });

  const isDoubles = matchType === 'DOUBLES';

  // Add participants
  for (let i = 1; i <= numTeams; i++) {
    if (isDoubles) {
      const idx1 = ((i - 1) * 2) % VIETNAMESE_NAMES.length;
      const idx2 = ((i - 1) * 2 + 1) % VIETNAMESE_NAMES.length;
      const name1 = VIETNAMESE_NAMES[idx1];
      const name2 = VIETNAMESE_NAMES[idx2];
      const teamName = `${name1} - ${name2}`;

      const partId = uuidv4();
      await db.insert(schema.tournamentParticipants).values({
        id: partId,
        tournamentId: tourId,
        tournamentDivisionId: divisionId,
        registeredBy: organizerId,
        teamName: teamName,
        teamStatus: 'COMPLETE',
        isMock: true,
        isPaid: true,
      });

      // Insert mock users & rosters for doubles details
      const user1Id = uuidv4();
      const user2Id = uuidv4();
      await db.insert(schema.users).values({ id: user1Id, email: `mock_${uuidv4().substring(0,8)}@vndc.com`, isMock: true });
      await db.insert(schema.profiles).values({ userId: user1Id, fullName: name1, allowStrangerMessages: false });
      await db.insert(schema.userRanks).values({
        userId: user1Id,
        categoryId: categoryId,
        matchType: matchType,
        eloPoints: Math.floor(Math.random() * (1600 - 1000 + 1) + 1000), // Random ELO between 1000 and 1600
        matchesPlayed: 10,
        matchesWon: 6,
      });
      await db.insert(schema.tournamentRosters).values({ participantId: partId, userId: user1Id, role: 'MAIN' });

      await db.insert(schema.users).values({ id: user2Id, email: `mock_${uuidv4().substring(0,8)}@vndc.com`, isMock: true });
      await db.insert(schema.profiles).values({ userId: user2Id, fullName: name2, allowStrangerMessages: false });
      await db.insert(schema.userRanks).values({
        userId: user2Id,
        categoryId: categoryId,
        matchType: matchType,
        eloPoints: Math.floor(Math.random() * (1600 - 1000 + 1) + 1000), // Random ELO between 1000 and 1600
        matchesPlayed: 12,
        matchesWon: 8,
      });
      await db.insert(schema.tournamentRosters).values({ participantId: partId, userId: user2Id, role: 'MAIN' });

    } else {
      const nameIndex = (i - 1) % VIETNAMESE_NAMES.length;
      const nameSuffix = i > VIETNAMESE_NAMES.length ? ` ${Math.ceil(i / VIETNAMESE_NAMES.length)}` : '';
      const teamName = `${VIETNAMESE_NAMES[nameIndex]}${nameSuffix}`;

      const partId = uuidv4();
      await db.insert(schema.tournamentParticipants).values({
        id: partId,
        tournamentId: tourId,
        tournamentDivisionId: divisionId,
        registeredBy: organizerId,
        teamName: teamName,
        teamStatus: 'COMPLETE',
        isMock: true,
        isPaid: true,
      });

      const userId = uuidv4();
      await db.insert(schema.users).values({ id: userId, email: `mock_${uuidv4().substring(0,8)}@vndc.com`, isMock: true });
      await db.insert(schema.profiles).values({ userId: userId, fullName: teamName, allowStrangerMessages: false });
      await db.insert(schema.userRanks).values({
        userId: userId,
        categoryId: categoryId,
        matchType: matchType,
        eloPoints: Math.floor(Math.random() * (1600 - 1000 + 1) + 1000), // Random ELO between 1000 and 1600
        matchesPlayed: 15,
        matchesWon: 9,
      });
      await db.insert(schema.tournamentRosters).values({ participantId: partId, userId: userId, role: 'MAIN' });
    }
  }

  return { tourId, divisionId };
}

async function main() {
  console.log('=== SEED COMPREHENSIVE TEST DATA START ===\n');

  // Clean old tournaments
  console.log('Cleaning old tournaments...');
  const oldTours = await db.select().from(schema.tournaments).where(sql`invite_code LIKE 'T-%'`);
  const oldTourIds = oldTours.map(t => t.id);
  if (oldTourIds.length > 0) {
    const stages = await db.select().from(schema.tournamentStages).where(inArray(schema.tournamentStages.tournamentId, oldTourIds));
    const stageIds = stages.map(s => s.id);
    if (stageIds.length > 0) {
      const groups = await db.select().from(schema.tournamentGroups).where(inArray(schema.tournamentGroups.stageId, stageIds));
      const groupIds = groups.map(g => g.id);
      if (groupIds.length > 0) {
        await db.delete(schema.groupStandings).where(inArray(schema.groupStandings.groupId, groupIds));
        await db.delete(schema.matches).where(inArray(schema.matches.groupId, groupIds));
        await db.delete(schema.tournamentGroups).where(inArray(schema.tournamentGroups.stageId, stageIds));
      }
      await db.delete(schema.tournamentStages).where(inArray(schema.tournamentStages.tournamentId, oldTourIds));
    }
    await db.delete(schema.tournamentParticipants).where(inArray(schema.tournamentParticipants.tournamentId, oldTourIds));
    await db.delete(schema.tournamentDivisions).where(inArray(schema.tournamentDivisions.tournamentId, oldTourIds));
    await db.delete(schema.tournaments).where(inArray(schema.tournaments.id, oldTourIds));
  }

  // Setup roles
  const roleMap = new Map<string, string>();
  const allRoles = await db.select().from(schema.roles);
  for (const r of allRoles) {
    roleMap.set(r.name, r.id);
  }

  // Get Category
  const badmintonCat = await db.select().from(schema.categories).where(eq(schema.categories.slug, 'badminton')).limit(1).then(r => r[0]);
  if (!badmintonCat) {
    console.error('Badminton category not found.');
    return;
  }

  // Get Organizer user
  const organizer = await db.select().from(schema.users).where(eq(schema.users.email, 'organizer@vndcsport.com')).limit(1).then(r => r[0]);
  if (!organizer) {
    console.error('Organizer not found.');
    return;
  }

  // Login to get token for bracket API
  const loginRes = await fetch('http://127.0.0.1:3000/api/v1/auth/mobile/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'organizer@vndcsport.com', password: 'password123' }),
  });
  const loginData = await loginRes.json().catch(() => ({}));
  const token = loginData?.data?.accessToken || loginData?.accessToken || '';
  if (!token) {
    console.error('API login failed.');
    return;
  }
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // Venue
  let venue = await db.select().from(schema.tournamentVenues).limit(1).then(r => r[0]);
  if (!venue) {
    const venueId = uuidv4();
    [venue] = await db.insert(schema.tournamentVenues).values({
      id: venueId, name: 'Nhà thi đấu trung tâm', locationAddress: 'Hà Nội',
    }).returning();
  }

  // Configurations for the 13 requested tournaments
  const configs = [
    // 1-4. Vòng loại trực tiếp (Single Elimination)
    { name: '1. Giải loại trực tiếp 10 đội', bracketType: 'single_elimination', numTeams: 10, matchType: 'SINGLES' as const },
    { name: '2. Giải loại trực tiếp 11 đội', bracketType: 'single_elimination', numTeams: 11, matchType: 'SINGLES' as const },
    { name: '3. Giải loại trực tiếp 12 đội (Đôi)', bracketType: 'single_elimination', numTeams: 12, matchType: 'DOUBLES' as const },
    { name: '4. Giải loại trực tiếp 13 đội', bracketType: 'single_elimination', numTeams: 13, matchType: 'SINGLES' as const },
    
    // 5-8. Nhánh thắng nhánh thua (Double Elimination)
    { name: '5. Giải thắng/thua 10 đội', bracketType: 'double_elimination', numTeams: 10, matchType: 'SINGLES' as const },
    { name: '6. Giải thắng/thua 11 đội (Đôi)', bracketType: 'double_elimination', numTeams: 11, matchType: 'DOUBLES' as const },
    { name: '7. Giải thắng/thua 12 đội', bracketType: 'double_elimination', numTeams: 12, matchType: 'SINGLES' as const },
    { name: '8. Giải thắng/thua 13 đội (Đôi)', bracketType: 'double_elimination', numTeams: 13, matchType: 'DOUBLES' as const },

    // 9-11. Vòng tròn tính điểm (Round Robin) - Max 8 đội
    { name: '9. Giải vòng tròn 6 đội', bracketType: 'round_robin', numTeams: 6, matchType: 'SINGLES' as const },
    { name: '10. Giải vòng tròn 7 đội (Đôi)', bracketType: 'round_robin', numTeams: 7, matchType: 'DOUBLES' as const },
    { name: '11. Giải vòng tròn 8 đội (Max)', bracketType: 'round_robin', numTeams: 8, matchType: 'SINGLES' as const },

    // 12-13. Vòng bảng + Playoffs (Group Stage + Knockout)
    {
      name: '12. Vòng bảng + Playoffs 31 đội',
      bracketType: 'group_stage_knockout',
      numTeams: 31,
      matchType: 'SINGLES' as const,
      groupConfig: {
        groupsConfig: {
          numGroups: 8,
          teamsPerGroup: 4,
          roundsToPlay: 1
        },
        advancementConfig: {
          teamsAdvancing: 2
        },
        playoffConfig: {
          type: 'SINGLE_ELIMINATION'
        }
      }
    },
    {
      name: '13. Vòng bảng + Playoffs 35 đội (Đôi)',
      bracketType: 'group_stage_knockout',
      numTeams: 35,
      matchType: 'DOUBLES' as const,
      groupConfig: {
        groupsConfig: {
          numGroups: 8,
          teamsPerGroup: 5,
          roundsToPlay: 1
        },
        advancementConfig: {
          teamsAdvancing: 2
        },
        playoffConfig: {
          type: 'SINGLE_ELIMINATION'
        }
      }
    }
  ];

  console.log(`Creating and simulating ${configs.length} tournaments...`);

  for (const cfg of configs) {
    console.log(`\n--- Creating: ${cfg.name} ---`);
    const tour = await createTournament({
      name: cfg.name,
      bracketType: cfg.bracketType,
      numTeams: cfg.numTeams,
      venueId: venue.id,
      categoryId: badmintonCat.id,
      organizerId: organizer.id,
      matchType: cfg.matchType,
      groupConfig: cfg.groupConfig
    });

    // 1. Generate brackets/matches
    await db.update(schema.tournaments).set({ status: 'DRAFT' }).where(eq(schema.tournaments.id, tour.tourId));
    const gen = await fetch(`http://127.0.0.1:3000/api/v1/tournaments/${tour.tourId}/generate-bracket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ divisionId: tour.divisionId }),
    });
    const genRes = await gen.json().catch(() => ({}));
    if (!gen.ok) {
      console.error(`Failed to generate bracket for ${cfg.name}:`, genRes);
      continue;
    }
    await db.update(schema.tournaments).set({ status: 'IN_PROGRESS' }).where(eq(schema.tournaments.id, tour.tourId));

    // 2. Play matches
    await simulateMatches(tour.tourId, authHeaders);

    // 3. For group stage + playoffs, advance to playoffs and play playoff matches
    if (cfg.bracketType === 'group_stage_knockout') {
      const stage = await db.select().from(schema.tournamentStages).where(and(eq(schema.tournamentStages.tournamentId, tour.tourId), eq(schema.tournamentStages.type, 'GROUP_STAGE'))).limit(1).then(r => r[0]);
      if (stage) {
        console.log(`  Advancing GP ${cfg.name} to Playoffs...`);
        const adv = await fetch(`http://127.0.0.1:3000/api/v1/tournaments/${tour.tourId}/advance-standings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ divisionId: tour.divisionId, stageId: stage.id }),
        });
        if (adv.ok) {
          await simulateMatches(tour.tourId, authHeaders);
        } else {
          console.error(`  Failed to advance playoffs for ${cfg.name}`);
        }
      }
    }
    console.log(`Tournament ${cfg.name} fully generated and simulated!`);
  }

  console.log('\n=== SEED COMPREHENSIVE TEST DATA COMPLETE ===');
  await sqlClient.end();
}

main().catch(async (err) => {
  console.error('Error in main seed:', err);
  await sqlClient.end();
  process.exit(1);
});
