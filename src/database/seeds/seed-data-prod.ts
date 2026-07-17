import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

const uuidv4 = () => crypto.randomUUID();
const sqlClient = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(sqlClient, { schema });

const MOCK_PLAYERS = [
  { name: 'Nguyễn Minh Danh', email: 'danh.nguyen@gmail.com' },
  { name: 'Phạm Hải Dũng', email: 'dung.pham@gmail.com' },
  { name: 'Trần Minh Bình', email: 'binh.tran@gmail.com' },
  { name: 'Lê Hoàng Cường', email: 'cuong.le@gmail.com' },
  { name: 'Vũ Quốc Phong', email: 'phong.vu@gmail.com' },
  { name: 'Đặng Khánh Linh', email: 'linh.dang@gmail.com' },
  { name: 'Bùi Minh Trí', email: 'tri.bui@gmail.com' },
  { name: 'Đỗ Thùy Trang', email: 'trang.do@gmail.com' },
  { name: 'Hồ Đức Hải', email: 'hai.ho@gmail.com' },
  { name: 'Nguyễn Minh Quân', email: 'quan.nguyen@gmail.com' },
  { name: 'Phạm Hồng Đăng', email: 'dang.pham@gmail.com' },
  { name: 'Trần Bảo Long', email: 'long.tran@gmail.com' },
  { name: 'Lê Quỳnh Anh', email: 'anh.le@gmail.com' },
  { name: 'Trịnh Công Sơn', email: 'son.trinh@gmail.com' },
  { name: 'Nguyễn An Bình', email: 'binh.nguyen@gmail.com' },
  { name: 'Võ Văn Quyết', email: 'quyet.vo@gmail.com' },
  { name: 'Nguyễn Thị Hoa', email: 'hoa.nguyen@gmail.com' },
  { name: 'Trần Văn Tú', email: 'tu.tran@gmail.com' },
  { name: 'Phạm Văn Nam', email: 'nam.pham@gmail.com' },
  { name: 'Hoàng Minh Ngọc', email: 'ngoc.hoang@gmail.com' },
  { name: 'Lý Quốc Bảo', email: 'bao.ly@gmail.com' },
  { name: 'Đoàn Văn Hậu', email: 'hau.doan@gmail.com' },
  { name: 'Nguyễn Quang Hải', email: 'hai.quang@gmail.com' },
  { name: 'Phan Văn Đức', email: 'duc.phan@gmail.com' },
];

function generateScore(winner: 1 | 2) {
  const sets: any[] = [];
  if (winner === 1) {
    sets.push({ team1Score: 11, team2Score: 7, isFinished: true });
    sets.push({ team1Score: 11, team2Score: 9, isFinished: true });
    return { p1SetsWon: 2, p2SetsWon: 0, scoreDetails: { sets } };
  } else {
    sets.push({ team1Score: 6, team2Score: 11, isFinished: true });
    sets.push({ team1Score: 8, team2Score: 11, isFinished: true });
    return { p1SetsWon: 0, p2SetsWon: 2, scoreDetails: { sets } };
  }
}

async function simulateMatches(tournamentId: string, authHeaders: any, playAll = false) {
  const BASE_URL = 'http://127.0.0.1:3000/api/v1';
  let iteration = 0;
  let hasPlayableMatches = true;

  while (hasPlayableMatches && iteration < 30) {
    iteration++;
    const res = await fetch(`${BASE_URL}/matches?tournamentId=${tournamentId}&limit=500`, {
      headers: { 'Content-Type': 'application/json', ...authHeaders },
    });
    const resData = await res.json().catch(() => ({}));
    const matches = Array.isArray(resData?.data) ? resData.data : [];

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

    if (!playAll && playable.length === 1 && matches.filter((m: any) => m.status !== 'COMPLETED').length === 1) {
      break;
    }

    for (const match of playable) {
      if (playAll || playable.length > 1 || match.roundNumber < 4) {
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
  matchType: 'SINGLES' | 'DOUBLES';
  status: 'DRAFT' | 'REGISTRATION_OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  fillCount: number;
  entryFee: string;
  description: string;
  prizeDescription: string;
}) {
  const { name, bracketType, numTeams, venueId, categoryId, organizerId, matchType, status, fillCount, entryFee, description, prizeDescription } = params;
  const tourId = uuidv4();
  const inviteCode = `P-${bracketType.substring(0,2).toUpperCase()}-${Date.now().toString().slice(-4)}`;

  await db.insert(schema.tournaments).values({
    id: tourId,
    name: name,
    description: description,
    categoryId: categoryId,
    createdBy: organizerId,
    status: status === 'COMPLETED' ? 'IN_PROGRESS' : status,
    matchType: matchType,
    sportRules: { kind: 'PICKLEBALL_RALLY', setsToWin: 2, pointsPerSet: 11, winByTwo: true },
    tournamentConfig: {
      bracketType: bracketType,
      maxTeams: numTeams,
    },
    venueId: venueId,
    entryFee: entryFee,
    tournamentType: 'PUBLIC',
    visibility: 'PUBLIC',
    maxParticipants: numTeams,
    registrationStartDate: new Date(Date.now() - 5 * 86400000),
    registrationEndDate: new Date(Date.now() + 10 * 86400000),
    startDate: new Date(Date.now() + 1 * 86400000),
    endDate: new Date(Date.now() + 2 * 86400000),
    inviteCode: inviteCode,
    isRanked: true,
    prizeDescription: prizeDescription,
  });

  const divisionId = uuidv4();
  await db.insert(schema.tournamentDivisions).values({
    id: divisionId,
    tournamentId: tourId,
    name: name,
    matchType: matchType,
    bracketType: bracketType,
    status: 'ACTIVE',
    entryFee: entryFee,
  });

  const isDoubles = matchType === 'DOUBLES';

  for (let i = 1; i <= fillCount; i++) {
    const partId = uuidv4();
    
    if (isDoubles) {
      const idx1 = ((i - 1) * 2) % MOCK_PLAYERS.length;
      const idx2 = ((i - 1) * 2 + 1) % MOCK_PLAYERS.length;
      const p1 = MOCK_PLAYERS[idx1];
      const p2 = MOCK_PLAYERS[idx2];
      const teamName = `${p1.name} - ${p2.name}`;

      await db.insert(schema.tournamentParticipants).values({
        id: partId,
        tournamentId: tourId,
        tournamentDivisionId: divisionId,
        registeredBy: organizerId,
        teamName: teamName,
        teamStatus: 'COMPLETE',
        seed: i,
        isMock: true,
        isPaid: true,
      });

      let [u1] = await db.select().from(schema.users).where(eq(schema.users.email, p1.email)).limit(1);
      if (!u1) {
        [u1] = await db.insert(schema.users).values({ id: uuidv4(), email: p1.email, isMock: true }).returning();
        await db.insert(schema.profiles).values({ userId: u1.id, fullName: p1.name });
      }
      await db.insert(schema.userRanks).values({
        userId: u1.id,
        categoryId: categoryId,
        matchType: matchType,
        eloPoints: 1200 + (i * 15) % 300,
        matchesPlayed: 8,
        matchesWon: 5,
      }).onConflictDoNothing();
      await db.insert(schema.tournamentRosters).values({ id: uuidv4(), participantId: partId, userId: u1.id, role: 'MAIN' });

      let [u2] = await db.select().from(schema.users).where(eq(schema.users.email, p2.email)).limit(1);
      if (!u2) {
        [u2] = await db.insert(schema.users).values({ id: uuidv4(), email: p2.email, isMock: true }).returning();
        await db.insert(schema.profiles).values({ userId: u2.id, fullName: p2.name });
      }
      await db.insert(schema.userRanks).values({
        userId: u2.id,
        categoryId: categoryId,
        matchType: matchType,
        eloPoints: 1150 + (i * 20) % 350,
        matchesPlayed: 6,
        matchesWon: 4,
      }).onConflictDoNothing();
      await db.insert(schema.tournamentRosters).values({ id: uuidv4(), participantId: partId, userId: u2.id, role: 'MAIN' });

    } else {
      const p = MOCK_PLAYERS[(i - 1) % MOCK_PLAYERS.length];
      const teamName = p.name;

      await db.insert(schema.tournamentParticipants).values({
        id: partId,
        tournamentId: tourId,
        tournamentDivisionId: divisionId,
        registeredBy: organizerId,
        teamName: teamName,
        teamStatus: 'COMPLETE',
        seed: i,
        isMock: true,
        isPaid: true,
      });

      let [u] = await db.select().from(schema.users).where(eq(schema.users.email, p.email)).limit(1);
      if (!u) {
        [u] = await db.insert(schema.users).values({ id: uuidv4(), email: p.email, isMock: true }).returning();
        await db.insert(schema.profiles).values({ userId: u.id, fullName: p.name });
      }
      await db.insert(schema.userRanks).values({
        userId: u.id,
        categoryId: categoryId,
        matchType: matchType,
        eloPoints: 1200 + (i * 25) % 250,
        matchesPlayed: 10,
        matchesWon: 6,
      }).onConflictDoNothing();
      await db.insert(schema.tournamentRosters).values({ id: uuidv4(), participantId: partId, userId: u.id, role: 'MAIN' });
    }
  }

  return { tourId, divisionId };
}

async function main() {
  console.log('=== KHỞI CHẠY SEED DỮ LIỆU GIẢI ĐẤU MẪU PRODUCTION ===\n');

  const pickleballCat = await db.select().from(schema.categories).where(eq(schema.categories.slug, 'pickleball')).limit(1).then(r => r[0]);
  if (!pickleballCat) {
    console.error('❌ Môn Pickleball chưa được tạo trong DB.');
    return;
  }

  // Sử dụng tài khoản Admin OAuth 2 làm Organizer chính thức
  const adminEmail = 'vndcsport@gmail.com';
  let [adminUser] = await db.select().from(schema.users).where(eq(schema.users.email, adminEmail)).limit(1);
  
  if (!adminUser) {
    console.error('❌ Không tìm thấy tài khoản admin hệ thống: vndcsport@gmail.com');
    return;
  }

  // Cập nhật pass tạm để login seed lấy token
  const hashedPassword = bcrypt.hashSync('Password123@', 12);
  await db.update(schema.users).set({ passwordHash: hashedPassword }).where(eq(schema.users.id, adminUser.id));

  // Venue
  let venue = await db.select().from(schema.tournamentVenues).limit(1).then(r => r[0]);
  if (!venue) {
    const venueId = uuidv4();
    [venue] = await db.insert(schema.tournamentVenues).values({
      id: venueId,
      name: 'VNDC Sport Club - Cụm sân Pickleball chuẩn Quốc tế',
      locationAddress: '154 Trần Não, Quận 2, TP. Hồ Chí Minh',
    }).returning();
  }

  // Gọi đúng API login của Mobile để lấy token (đồng bộ như dev)
  const BASE_URL = 'http://127.0.0.1:3000/api/v1';
  console.log('Đang kết nối API Backend để tạo Token...');
  const loginRes = await fetch(`${BASE_URL}/auth/mobile/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: 'Password123@' }),
  }).catch(() => null);

  let token = '';
  if (loginRes && loginRes.ok) {
    const loginData = await loginRes.json().catch(() => ({}));
    token = loginData?.data?.accessToken || loginData?.accessToken || '';
  }

  if (!token) {
    console.error('❌ Không thể lấy token API để generate bracket.');
  }

  const authHeaders = (token ? { 'Authorization': `Bearer ${token}` } : {}) as Record<string, string>;

  const tourConfigs = [
    {
      name: '1. Giải loại trực tiếp 10 đội (Đơn)',
      bracketType: 'single_elimination',
      numTeams: 10,
      fillCount: 10,
      matchType: 'SINGLES' as const,
      status: 'IN_PROGRESS' as const,
      entryFee: '150000.00',
      description: 'Giải đấu loại trực tiếp đơn nam với 10 vận động viên tham dự.',
      prizeDescription: 'Cúp + 2.000.000 VNĐ.',
    },
    {
      name: '2. Giải loại trực tiếp 11 đội (Đơn)',
      bracketType: 'single_elimination',
      numTeams: 11,
      fillCount: 11,
      matchType: 'SINGLES' as const,
      status: 'COMPLETED' as const,
      entryFee: '150000.00',
      description: 'Giải đấu loại trực tiếp đơn nam đã hoàn thành thi đấu.',
      prizeDescription: 'Cúp + 2.000.000 VNĐ.',
    },
    {
      name: '3. Giải loại trực tiếp 12 đội (Đôi)',
      bracketType: 'single_elimination',
      numTeams: 12,
      fillCount: 6,
      matchType: 'DOUBLES' as const,
      status: 'REGISTRATION_OPEN' as const,
      entryFee: '250000.00',
      description: 'Giải đấu loại trực tiếp đôi nam nữ đang mở cổng đăng ký trực tuyến.',
      prizeDescription: 'Cúp đôi + 4.000.000 VNĐ.',
    },
    {
      name: '4. Giải loại trực tiếp 13 đội (Đơn)',
      bracketType: 'single_elimination',
      numTeams: 13,
      fillCount: 13,
      matchType: 'SINGLES' as const,
      status: 'IN_PROGRESS' as const,
      entryFee: '150000.00',
      description: 'Giải đấu loại trực tiếp đơn nam đang diễn ra căng thẳng.',
      prizeDescription: 'Cúp + 2.000.000 VNĐ.',
    },
    {
      name: '5. Giải thắng/thua 10 đội (Đơn)',
      bracketType: 'double_elimination',
      numTeams: 10,
      fillCount: 10,
      matchType: 'SINGLES' as const,
      status: 'COMPLETED' as const,
      entryFee: '200000.00',
      description: 'Giải đấu nhánh thắng nhánh thua đơn nam đã hoàn thành và tìm ra nhà vô địch.',
      prizeDescription: 'Cúp + 3.000.000 VNĐ.',
    },
    {
      name: '6. Giải thắng/thua 11 đội (Đôi)',
      bracketType: 'double_elimination',
      numTeams: 11,
      fillCount: 11,
      matchType: 'DOUBLES' as const,
      status: 'IN_PROGRESS' as const,
      entryFee: '300000.00',
      description: 'Giải đấu đôi nhánh thắng nhánh thua cực kỳ hấp dẫn.',
      prizeDescription: 'Cúp đôi + 5.000.000 VNĐ.',
    },
    {
      name: '7. Giải thắng/thua 12 đội (Đơn)',
      bracketType: 'double_elimination',
      numTeams: 12,
      fillCount: 4,
      matchType: 'SINGLES' as const,
      status: 'REGISTRATION_OPEN' as const,
      entryFee: '200000.00',
      description: 'Giải đấu đơn nam nhánh thắng nhánh thua đang nhận đơn đăng ký.',
      prizeDescription: 'Cúp + 3.000.000 VNĐ.',
    },
    {
      name: '8. Giải thắng/thua 13 đội (Đôi)',
      bracketType: 'double_elimination',
      numTeams: 13,
      fillCount: 13,
      matchType: 'DOUBLES' as const,
      status: 'IN_PROGRESS' as const,
      entryFee: '300000.00',
      description: 'Giải đấu đôi nhánh thắng nhánh thua đang diễn ra các vòng đấu knock-out.',
      prizeDescription: 'Cúp đôi + 5.000.000 VNĐ.',
    },
    {
      name: '9. Giải vòng tròn 6 đội (Đơn)',
      bracketType: 'round_robin',
      numTeams: 6,
      fillCount: 6,
      matchType: 'SINGLES' as const,
      status: 'IN_PROGRESS' as const,
      entryFee: '100000.00',
      description: 'Giải đấu vòng tròn tính điểm cọ xát đơn nam.',
      prizeDescription: 'Huy chương + Quà tặng lưu niệm.',
    },
    {
      name: '10. Giải vòng tròn 7 đội (Đôi)',
      bracketType: 'round_robin',
      numTeams: 7,
      fillCount: 7,
      matchType: 'DOUBLES' as const,
      status: 'COMPLETED' as const,
      entryFee: '200000.00',
      description: 'Giải đấu vòng tròn đôi nam nữ đã kết thúc tất cả các lượt trận vòng tròn.',
      prizeDescription: 'Huy chương + Quà tặng lưu niệm.',
    },
    {
      name: '11. Giải vòng tròn 8 đội (Đơn)',
      bracketType: 'round_robin',
      numTeams: 8,
      fillCount: 3,
      matchType: 'SINGLES' as const,
      status: 'REGISTRATION_OPEN' as const,
      entryFee: '100000.00',
      description: 'Giải đấu vòng tròn đơn nam quy mô tối đa 8 vận động viên.',
      prizeDescription: 'Huy chương + Quà tặng lưu niệm.',
    },
  ];

  for (const cfg of tourConfigs) {
    console.log(`\n➜ Đang tạo giải đấu: ${cfg.name}...`);
    const tour = await createTournament({
      name: cfg.name,
      bracketType: cfg.bracketType,
      numTeams: cfg.numTeams,
      fillCount: cfg.fillCount,
      venueId: venue.id,
      categoryId: pickleballCat.id,
      organizerId: adminUser.id,
      matchType: cfg.matchType,
      status: cfg.status,
      entryFee: cfg.entryFee,
      description: cfg.description,
      prizeDescription: cfg.prizeDescription,
    });

    if (cfg.status === 'IN_PROGRESS' || cfg.status === 'COMPLETED') {
      if (!token) {
        console.log(`   ⚠ Không có token API (Không thể sinh sơ đồ).`);
        continue;
      }

      await db.update(schema.tournaments).set({ status: 'DRAFT' }).where(eq(schema.tournaments.id, tour.tourId));
      
      const gen = await fetch(`${BASE_URL}/tournaments/${tour.tourId}/generate-bracket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ divisionId: tour.divisionId }),
      });

      if (gen.ok) {
        console.log('   ➜ Sinh sơ đồ thi đấu thành công.');
        await db.update(schema.tournaments).set({ status: 'IN_PROGRESS' }).where(eq(schema.tournaments.id, tour.tourId));
        
        const playAll = cfg.status === 'COMPLETED';
        await simulateMatches(tour.tourId, authHeaders, playAll);
        
        if (playAll) {
          await db.update(schema.tournaments).set({ status: 'COMPLETED' }).where(eq(schema.tournaments.id, tour.tourId));
          console.log('   ➜ Giả lập hoàn thành toàn bộ giải đấu thành công!');
        } else {
          console.log('   ➜ Giả lập các trận đấu vòng ngoài thành công (Chừa lại trận chung kết để tiếp tục vận hành).');
        }
      } else {
        const errorMsg = await gen.text();
        console.error(`   ❌ Lỗi khi tự động sinh sơ đồ thi đấu: ${errorMsg}`);
      }
    }
  }

  console.log('\n=== HOÀN TẤT SEED DỮ LIỆU GIẢI ĐẤU MẪU PRODUCTION ===');
  await sqlClient.end();
}

main().catch(async (err) => {
  console.error('Lỗi khi chạy seed database:', err);
  await sqlClient.end();
  process.exit(1);
});
