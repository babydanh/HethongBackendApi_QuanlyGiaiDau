const BASE_URL = 'https://giaidau.vnvar.com/api/v1';

async function request(path: string, options: any = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { message: text };
  }
  if (!res.ok) {
    const msg = data?.message || (Array.isArray(data?.message) ? data.message.join(', ') : `HTTP ${res.status}`);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

async function main() {
  console.log('🚀 Đang kết nối tài khoản macter.970@gmail.com để seed 3 Giải đấu đang MỞ ĐĂNG KÝ...');

  const targetEmail = 'macter.970@gmail.com';
  const pass = '123456';

  let token = '';
  try {
    console.log(`🔑 Đăng nhập với ${targetEmail}...`);
    const loginRes = await request('/auth/mobile/login', {
      method: 'POST',
      body: JSON.stringify({ email: targetEmail, password: pass }),
    });
    token = loginRes.data?.accessToken || loginRes.accessToken;
    if (token) {
      console.log(`✅ Đăng nhập thành công tài khoản: ${targetEmail}!`);
    }
  } catch (e: any) {
    console.log(`  -> ${e.message}`);
  }

  if (!token) {
    console.error(`❌ Thất bại: Không thể đăng nhập bằng tài khoản ${targetEmail}!`);
    process.exit(1);
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Lấy Categories
  const catRes = await request('/categories');
  const categories: any[] = catRes.data || catRes;
  const findCat = (slug: string) =>
    categories.find((c) => c.slug.toLowerCase() === slug.toLowerCase()) || categories[0];

  const pickleballCat = findCat('pickleball');
  const badmintonCat = findCat('badminton');
  const tennisCat = findCat('tennis');

  console.log(`Categories: Pickleball=${pickleballCat?.id}, Badminton=${badmintonCat?.id}, Tennis=${tennisCat?.id}`);

  const NOW_TS = Date.now();
  const DAY_MS = 86400000;

  // ───────────────────────────────────────────────────────────────────────────
  // GIẢI 1: ĐƠN (Pickleball - Đơn Nam & Đơn Nữ) - Đang Mở Đăng Ký
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 1. Tạo Giải Pickleball Đơn Nam & Đơn Nữ (BTC: macter.970@gmail.com) ---');
  try {
    const t1 = await request('/tournaments', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: '🏆 Giải Pickleball Đơn Nam & Đơn Nữ Mở Rộng 2026',
        description: 'Giải đấu Đơn Nam và Đơn Nữ do macter.970@gmail.com tổ chức. Đang mở cổng đăng ký trực tuyến!',
        categoryId: pickleballCat.id,
        matchType: 'SINGLES',
        genderRestriction: 'MALE',
        tournamentConfig: { bracketType: 'SINGLE_ELIMINATION', maxTeams: 16 },
        sportRules: pickleballCat.categoryConfig?.defaultSportRules || { setsToWin: 2, pointsPerSet: 11 },
        entryFee: 100000,
        maxParticipants: 16,
        registrationStartDate: new Date(NOW_TS - 2 * DAY_MS).toISOString(),
        registrationEndDate: new Date(NOW_TS + 14 * DAY_MS).toISOString(),
        startDate: new Date(NOW_TS + 15 * DAY_MS).toISOString(),
        endDate: new Date(NOW_TS + 20 * DAY_MS).toISOString(),
        visibility: 'PUBLIC',
        tournamentType: 'PUBLIC',
        prizeDescription: 'Cúp vô địch + 3.000.000đ tiền mặt',
      }),
    });

    const tour1Id = t1.data?.id || t1.id;
    console.log(`✅ Đã tạo Tournament Đơn thành công: ID = ${tour1Id}`);

    // Tạo Divisions trước
    await request(`/tournaments/${tour1Id}/divisions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Nội dung Đơn Nam',
        matchType: 'SINGLES',
        genderRestriction: 'MALE',
        entryFee: 100000,
        maxParticipants: 16,
      }),
    }).catch((err: any) => console.log('Div 1 notice:', err.message));

    await request(`/tournaments/${tour1Id}/divisions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Nội dung Đơn Nữ',
        matchType: 'SINGLES',
        genderRestriction: 'FEMALE',
        entryFee: 100000,
        maxParticipants: 16,
      }),
    }).catch((err: any) => console.log('Div 2 notice:', err.message));

    // Sau đó PATCH status sang REGISTRATION_OPEN
    await request(`/tournaments/${tour1Id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'REGISTRATION_OPEN' }),
    }).catch((err) => console.log('Status update notice:', err.message));
    console.log(`🚀 Đã mở đăng ký cho Giải Pickleball Đơn: ${tour1Id}`);

  } catch (e: any) {
    console.error('❌ Lỗi tạo giải Đơn:', e.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GIẢI 2: ĐÔI (Cầu Lông - Đôi Nam & Đôi Nữ) - Đang Mở Đăng Ký
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. Tạo Giải Cầu Lông Đôi Nam & Đôi Nữ (BTC: macter.970@gmail.com) ---');
  try {
    const t2 = await request('/tournaments', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: '🏆 Giải Cầu Lông Đôi Nam & Đôi Nữ Mở Rộng 2026',
        description: 'Giải cầu lông quy mô đôi nam và đôi nữ toàn quốc do macter.970@gmail.com tổ chức. Đang nhận hồ sơ đăng ký thi đấu!',
        categoryId: badmintonCat.id,
        matchType: 'DOUBLES',
        genderRestriction: 'MALE',
        tournamentConfig: { bracketType: 'SINGLE_ELIMINATION', maxTeams: 16 },
        sportRules: badmintonCat.categoryConfig?.defaultSportRules || { setsToWin: 2, pointsPerSet: 21 },
        entryFee: 150000,
        maxParticipants: 16,
        registrationStartDate: new Date(NOW_TS - 2 * DAY_MS).toISOString(),
        registrationEndDate: new Date(NOW_TS + 14 * DAY_MS).toISOString(),
        startDate: new Date(NOW_TS + 15 * DAY_MS).toISOString(),
        endDate: new Date(NOW_TS + 20 * DAY_MS).toISOString(),
        visibility: 'PUBLIC',
        tournamentType: 'PUBLIC',
        prizeDescription: 'Cúp đôi vô địch + 5.000.000đ tiền mặt',
      }),
    });

    const tour2Id = t2.data?.id || t2.id;
    console.log(`✅ Đã tạo Tournament Đôi thành công: ID = ${tour2Id}`);

    await request(`/tournaments/${tour2Id}/divisions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Nội dung Đôi Nam',
        matchType: 'DOUBLES',
        genderRestriction: 'MALE',
        entryFee: 150000,
        maxParticipants: 16,
      }),
    }).catch((err: any) => console.log('Div 1 notice:', err.message));

    await request(`/tournaments/${tour2Id}/divisions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Nội dung Đôi Nữ',
        matchType: 'DOUBLES',
        genderRestriction: 'FEMALE',
        entryFee: 150000,
        maxParticipants: 16,
      }),
    }).catch((err: any) => console.log('Div 2 notice:', err.message));

    await request(`/tournaments/${tour2Id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'REGISTRATION_OPEN' }),
    }).catch((err) => console.log('Status update notice:', err.message));
    console.log(`🚀 Đã mở đăng ký cho Giải Cầu Lông Đôi: ${tour2Id}`);

  } catch (e: any) {
    console.error('❌ Lỗi tạo giải Đôi:', e.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GIẢI 3: ĐÔI NAM NỮ (Tennis - Mixed Doubles) - Đang Mở Đăng Ký
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. Tạo Giải Tennis Đôi Nam Nữ (BTC: macter.970@gmail.com) ---');
  try {
    const t3 = await request('/tournaments', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: '🏆 Giải Tennis Đôi Nam Nữ Mở Rộng 2026',
        description: 'Giải đấu thi đấu Đôi Nam Nữ (Mixed Doubles) do macter.970@gmail.com tổ chức. Mở đăng ký tự do trên toàn hệ thống!',
        categoryId: tennisCat.id,
        matchType: 'MIXED_DOUBLES',
        genderRestriction: 'MIXED',
        tournamentConfig: { bracketType: 'SINGLE_ELIMINATION', maxTeams: 16 },
        sportRules: tennisCat.categoryConfig?.defaultSportRules || { setsToWin: 2, pointsPerSet: 6 },
        entryFee: 200000,
        maxParticipants: 16,
        registrationStartDate: new Date(NOW_TS - 2 * DAY_MS).toISOString(),
        registrationEndDate: new Date(NOW_TS + 14 * DAY_MS).toISOString(),
        startDate: new Date(NOW_TS + 15 * DAY_MS).toISOString(),
        endDate: new Date(NOW_TS + 20 * DAY_MS).toISOString(),
        visibility: 'PUBLIC',
        tournamentType: 'PUBLIC',
        prizeDescription: 'Cúp đôi vô địch + 6.000.000đ tiền mặt',
      }),
    });

    const tour3Id = t3.data?.id || t3.id;
    console.log(`✅ Đã tạo Tournament Đôi Nam Nữ thành công: ID = ${tour3Id}`);

    await request(`/tournaments/${tour3Id}/divisions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Nội dung Đôi Nam Nữ',
        matchType: 'MIXED_DOUBLES',
        genderRestriction: 'MIXED',
        entryFee: 200000,
        maxParticipants: 16,
      }),
    }).catch((err: any) => console.log('Div 1 notice:', err.message));

    await request(`/tournaments/${tour3Id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ status: 'REGISTRATION_OPEN' }),
    }).catch((err) => console.log('Status update notice:', err.message));
    console.log(`🚀 Đã mở đăng ký cho Giải Tennis Đôi Nam Nữ: ${tour3Id}`);

  } catch (e: any) {
    console.error('❌ Lỗi tạo giải Đôi Nam Nữ:', e.message);
  }

  console.log('\n=======================================================');
  console.log('🎉 SEED HOÀN TẤT VỚI BTC MACTER.970@GMAIL.COM!');
  console.log('=======================================================');
}

main();
