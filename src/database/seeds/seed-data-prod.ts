import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { createPostgresClientFromEnv } from '../postgres-client';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

const uuidv4 = () => crypto.randomUUID();
const sqlClient = createPostgresClientFromEnv({ ssl: undefined });
const db = drizzle(sqlClient, { schema });

// Khai báo BASE_URL phạm vi toàn cục để dùng chung
const BASE_URL = 'https://giaidau.vnvar.com/api/v1';

// Danh sách vận động viên mẫu với tên tuổi rõ ràng, mang tính chuyên nghiệp
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

// Giả lập chơi các trận đấu qua REST API
async function simulateMatches(tournamentId: string, authHeaders: any, playAll = false) {
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

    // Nếu không phải playAll và chỉ còn đúng 1 trận duy nhất (Trận chung kết), chừa lại để giữ trạng thái IN_PROGRESS
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
  fillCount: number; // Số đội thực tế điền sẵn vào
  entryFee: string;
  description: string;
  prizeDescription: string;
  groupConfig?: Record<string, unknown>; // Cấu hình group stage nếu có
}) {
  const { name, bracketType, numTeams, venueId, categoryId, organizerId, matchType, status, fillCount, entryFee, description, prizeDescription, groupConfig } = params;
  const tourId = uuidv4();
  const inviteCode = `P-${bracketType.substring(0,2).toUpperCase()}-${Date.now().toString().slice(-4)}`;

  // Tạo giải đấu chính (Tự động duyệt để hiển thị Public)
  await db.insert(schema.tournaments).values({
    id: tourId,
    name: name,
    description: description,
    categoryId: categoryId,
    createdBy: organizerId,
    status: status === 'COMPLETED' ? 'IN_PROGRESS' : status, // API chốt kết quả sẽ chuyển thành COMPLETED sau
    matchType: matchType,
    sportRules: { kind: 'PICKLEBALL_RALLY', setsToWin: 2, pointsPerSet: 11, winByTwo: true },
    tournamentConfig: {
      bracketType: bracketType.toUpperCase(),
      maxTeams: numTeams,
      ...(groupConfig || {}),
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

  // Tạo Division
  const divisionId = uuidv4();
  await db.insert(schema.tournamentDivisions).values({
    id: divisionId,
    tournamentId: tourId,
    name: name,
    matchType: matchType,
    bracketType: bracketType.toUpperCase(),
    status: 'ACTIVE',
    entryFee: entryFee,
  });

  const isDoubles = matchType === 'DOUBLES';

  // Thêm danh sách người chơi mẫu đăng ký giải
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

      // Tạo Email duy nhất bằng cách đính kèm ID hoặc chỉ số vòng lặp i để tránh trùng User
      const uniqueEmail1 = `p_${tourId.substring(0, 4)}_${i}_1@vndcsport.vn`;
      const uniqueEmail2 = `p_${tourId.substring(0, 4)}_${i}_2@vndcsport.vn`;

      let [u1] = await db.insert(schema.users).values({ id: uuidv4(), email: uniqueEmail1, isMock: true }).returning();
      await db.insert(schema.profiles).values({ userId: u1.id, fullName: `${p1.name} (${i}A)` });
      await db.insert(schema.userRanks).values({
        userId: u1.id,
        categoryId: categoryId,
        matchType: matchType,
        eloPoints: 1200 + (i * 15) % 300,
        matchesPlayed: 8,
        matchesWon: 5,
      }).onConflictDoNothing();
      await db.insert(schema.tournamentRosters).values({ id: uuidv4(), participantId: partId, userId: u1.id, role: 'MAIN' });

      let [u2] = await db.insert(schema.users).values({ id: uuidv4(), email: uniqueEmail2, isMock: true }).returning();
      await db.insert(schema.profiles).values({ userId: u2.id, fullName: `${p2.name} (${i}B)` });
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

      // Tạo Email duy nhất cho người chơi đơn
      const uniqueEmail = `p_${tourId.substring(0, 4)}_${i}@vndcsport.vn`;

      let [u] = await db.insert(schema.users).values({ id: uuidv4(), email: uniqueEmail, isMock: true }).returning();
      await db.insert(schema.profiles).values({ userId: u.id, fullName: `${p.name} (VĐV ảo)` });
      
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

  // 1. Lấy thông tin cơ bản
  const pickleballCat = await db.select().from(schema.categories).where(eq(schema.categories.slug, 'pickleball')).limit(1).then(r => r[0]);
  if (!pickleballCat) {
    console.error('❌ Môn Pickleball chưa được tạo trong DB. Vui lòng chạy seed categories trước.');
    return;
  }

  // Khởi tạo các Role cần gán
  const roles = await db.select().from(schema.roles);
  const adminRole = roles.find(r => r.name === 'ADMIN');
  const orgRole = roles.find(r => r.name === 'ORGANIZER');
  const playerRole = roles.find(r => r.name === 'PLAYER');
  
  if (!adminRole || !orgRole) {
    console.error('❌ Không tìm thấy Role ADMIN hoặc ORGANIZER trong hệ thống.');
    return;
  }

  // Khởi tạo/Cập nhật 2 Admin cần gán
  const adminEmails = ['macter.970@gmail.com', 'hxlinh1683@gmail.com'];
  const adminUsers: any[] = [];

  for (const email of adminEmails) {
    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    if (!user) {
      [user] = await db.insert(schema.users).values({
        id: uuidv4(),
        email: email,
        passwordHash: null, // Tài khoản Google OAuth 2 không có mật khẩu
        isMock: false,
        isEmailVerified: true,
      }).returning();
      
      await db.insert(schema.profiles).values({
        userId: user.id,
        fullName: email.split('@')[0],
      });
      console.log(`➜ Đã tạo tài khoản admin mới: ${email}`);
    }

    // Gán các role cần thiết cho admin
    await db.insert(schema.userToRoles).values({ userId: user.id, roleId: adminRole.id }).onConflictDoNothing();
    await db.insert(schema.userToRoles).values({ userId: user.id, roleId: orgRole.id }).onConflictDoNothing();
    if (playerRole) {
      await db.insert(schema.userToRoles).values({ userId: user.id, roleId: playerRole.id }).onConflictDoNothing();
    }

    adminUsers.push(user);
  }

  const defaultOrganizerId = adminUsers[1].id; // hxlinh1683@gmail.com
  const secondOrganizerId = adminUsers[0].id;  // macter.970@gmail.com

  // 2. Tạo Sân đấu (Venue)
  let venue = await db.select().from(schema.tournamentVenues).limit(1).then(r => r[0]);
  if (!venue) {
    const venueId = uuidv4();
    [venue] = await db.insert(schema.tournamentVenues).values({
      id: venueId,
      name: 'VNDC Sport Club - Cụm sân Pickleball chuẩn Quốc tế',
      locationAddress: '154 Trần Não, Quận 2, TP. Hồ Chí Minh',
    }).returning();
    console.log('➜ Đã tạo cụm sân đấu VNDC Sport Club.');
  }

  // 3. Tự tạo Token JWT hợp lệ từ khóa bí mật JWT_ACCESS_SECRET thay vì gọi API login
  console.log('Đang tự tạo Token JWT xác thực Admin từ Env...');
  const jwtSecret = process.env.JWT_ACCESS_SECRET || 'your-production-access-secret-key-change-me';
  
  // Payload JWT đồng bộ như auth.service.ts
  const tokenPayload = {
    sub: secondOrganizerId, // macter.970@gmail.com
    email: 'macter.970@gmail.com',
    roles: ['ADMIN', 'ORGANIZER', 'PLAYER'],
    jti: crypto.randomUUID(),
  };

  const token = jwt.sign(tokenPayload, jwtSecret, { expiresIn: '15m' });
  const authHeaders = (token ? { 'Authorization': `Bearer ${token}` } : {}) as Record<string, string>;

  // 4. Định nghĩa cấu hình 13 giải đấu mẫu chuyên nghiệp
  const tourConfigs = [
    // 1-4. Vòng loại trực tiếp (Single Elimination)
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
      fillCount: 6, // Đang mở đăng ký, mới có 6 đôi đăng ký
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
    
    // 5-8. Nhánh thắng nhánh thua (Double Elimination)
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
      fillCount: 4, // Đang mở đăng ký, mới có 4 người
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

    // 9-11. Vòng tròn tính điểm (Round Robin) - Max 8 đội
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
      fillCount: 3, // Đang mở đăng ký
      matchType: 'SINGLES' as const,
      status: 'REGISTRATION_OPEN' as const,
      entryFee: '100000.00',
      description: 'Giải đấu vòng tròn đơn nam quy mô tối đa 8 vận động viên.',
      prizeDescription: 'Huy chương + Quà tặng lưu niệm.',
    },

    // 12-13. Vòng bảng + Playoffs (Group Stage + Knockout)
    {
      name: '12. Vòng bảng + Playoffs 32 đội (Đơn)',
      bracketType: 'group_stage_knockout',
      numTeams: 32,
      fillCount: 32,
      matchType: 'SINGLES' as const,
      status: 'IN_PROGRESS' as const,
      entryFee: '200000.00',
      description: 'Giải đấu chuyên nghiệp quy mô lớn chia làm 8 bảng đấu tranh suất vào Playoffs.',
      prizeDescription: 'Cúp vô địch + Cờ lưu niệm + 7.000.000 VNĐ.',
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
      name: '13. Vòng bảng + Playoffs 40 đội (Đôi)',
      bracketType: 'group_stage_knockout',
      numTeams: 40,
      fillCount: 40,
      matchType: 'DOUBLES' as const,
      status: 'IN_PROGRESS' as const,
      entryFee: '400000.00',
      description: 'Giải đôi nam nữ quy mô lớn nhất hệ thống, chia bảng đấu để lựa chọn cặp đấu xuất sắc nhất.',
      prizeDescription: 'Cúp đôi vô địch + Cờ lưu niệm + 10.000.000 VNĐ.',
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

  let count = 0;
  for (const cfg of tourConfigs) {
    count++;
    const organizerId = (count % 2 === 0) ? secondOrganizerId : defaultOrganizerId;
    console.log(`\n➜ Đang tạo giải đấu: ${cfg.name}...`);
    const tour = await createTournament({
      name: cfg.name,
      bracketType: cfg.bracketType,
      numTeams: cfg.numTeams,
      fillCount: cfg.fillCount,
      venueId: venue.id,
      categoryId: pickleballCat.id,
      organizerId: organizerId,
      matchType: cfg.matchType,
      status: cfg.status,
      entryFee: cfg.entryFee,
      description: cfg.description,
      prizeDescription: cfg.prizeDescription,
      groupConfig: (cfg as Record<string, unknown>).groupConfig as Record<string, unknown> | undefined,
    });

    // Nếu giải đấu bắt đầu đấu (IN_PROGRESS hoặc COMPLETED), tự động sinh sơ đồ nhánh đấu và giả lập trận đấu
    if (cfg.status === 'IN_PROGRESS' || cfg.status === 'COMPLETED') {
      if (!token) {
        console.log(`   ⚠ Không có token API (Vui lòng vào trang quản trị phê duyệt & Bắt đầu giải đấu này sau).`);
        continue;
      }

      // Đưa giải đấu về nháp để sinh nhánh đấu qua API
      await db.update(schema.tournaments).set({ status: 'DRAFT' }).where(eq(schema.tournaments.id, tour.tourId));
      
      const gen = await fetch(`${BASE_URL}/tournaments/${tour.tourId}/generate-bracket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ divisionId: tour.divisionId }),
      });

      if (gen.ok) {
        console.log('   ➜ Sinh sơ đồ thi đấu thành công.');
        await db.update(schema.tournaments).set({ status: 'IN_PROGRESS' }).where(eq(schema.tournaments.id, tour.tourId));
        
        // Giả lập chơi các trận đấu
        const playAll = cfg.status === 'COMPLETED';
        await simulateMatches(tour.tourId, authHeaders, playAll);
        
        // Với định dạng Group Stage + Playoffs, tự động đẩy các đội vượt qua vòng bảng vào vòng Playoffs
        if (cfg.bracketType === 'group_stage_knockout') {
          const stage = await db.select().from(schema.tournamentStages).where(and(eq(schema.tournamentStages.tournamentId, tour.tourId), eq(schema.tournamentStages.type, 'GROUP_STAGE'))).limit(1).then(r => r[0]);
          if (stage) {
            console.log(`   ➜ Đang tự động chuyển các đội đi tiếp từ Vòng bảng vào Playoffs...`);
            const adv = await fetch(`${BASE_URL}/tournaments/${tour.tourId}/advance-standings`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders },
              body: JSON.stringify({ divisionId: tour.divisionId, stageId: stage.id }),
            });
            if (adv.ok) {
              await simulateMatches(tour.tourId, authHeaders, playAll);
            }
          }
        }
        
        if (playAll) {
          // Update trạng thái giải thành COMPLETED
          await db.update(schema.tournaments).set({ status: 'COMPLETED' }).where(eq(schema.tournaments.id, tour.tourId));
          console.log('   ➜ Giả lập hoàn thành toàn bộ giải đấu thành công!');
        } else {
          console.log('   ➜ Giả lập các trận đấu vòng ngoài thành công (Chừa lại trận chung kết để tiếp tục vận hành).');
        }
      } else {
        const errorText = await gen.text();
        console.error(`   ❌ Lỗi khi tự động sinh sơ đồ thi đấu: ${errorText}`);
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
