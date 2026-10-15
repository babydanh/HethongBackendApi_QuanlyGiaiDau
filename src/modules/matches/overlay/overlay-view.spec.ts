import * as fs from 'fs';
import * as path from 'path';
import { buildOverlayContent } from './overlay-view';
import type {
  OverlayContent,
  OverlayMatchInput,
  OverlayParticipantInput,
} from './overlay.types';
import type { OverlayViewInput } from './overlay-view';

const FIXTURE_DIR = path.join(process.cwd(), 'test', 'fixtures', 'overlay');
const FORBIDDEN_KEYS = [
  'email',
  'phone',
  'phoneNumber',
  'userId',
  'elo',
  'eloPoints',
  'seed',
  'code',
];

const person = (name: string, avatarUrl: string | null = null) => ({
  fullName: name,
  avatarUrl,
});
const pair = (id: string, a: string, b: string): OverlayParticipantInput => ({
  id,
  teamName: `Cặp ${id}`,
  members: [person(a), person(b)],
});
const single = (id: string, a: string): OverlayParticipantInput => ({
  id,
  teamName: a,
  members: [person(a)],
});

function match(
  id: string,
  round: number,
  order: number,
  next: string | null,
  p1: OverlayParticipantInput | null,
  p2: OverlayParticipantInput | null,
  extra: Partial<OverlayMatchInput> = {},
): OverlayMatchInput {
  return {
    id,
    roundNumber: round,
    matchOrder: order,
    nextMatchId: next,
    winnerId: null,
    status: 'SCHEDULED',
    isBye: false,
    p1SetsWon: 0,
    p2SetsWon: 0,
    participant1: p1,
    participant2: p2,
    ...extra,
  };
}

/** Giải 16 cặp đôi, đang xem tứ kết số 2: dùng cho fixture vàng và kiểm tra tổng hợp. */
function doubles16(): { stage: OverlayMatchInput[]; current: OverlayMatchInput } {
  const names: [string, string][] = Array.from({ length: 16 }, (_, i) => [
    `Họ Vận${i + 1}a`,
    `Họ Vận${i + 1}b`,
  ]);
  const stage: OverlayMatchInput[] = [];
  for (let i = 0; i < 8; i++) {
    const [a1, b1] = names[2 * i];
    const [a2, b2] = names[2 * i + 1];
    stage.push(
      match(
        `r1m${i}`,
        1,
        i + 1,
        `r2m${Math.floor(i / 2)}`,
        pair(`p${2 * i + 1}`, a1, b1),
        pair(`p${2 * i + 2}`, a2, b2),
        {
          status: 'COMPLETED',
          winnerId: `p${2 * i + 1}`,
          p1SetsWon: 2,
          p2SetsWon: i % 2,
        },
      ),
    );
  }
  for (let i = 0; i < 4; i++) {
    stage.push(
      match(
        `r2m${i}`,
        2,
        i + 1,
        `r3m${Math.floor(i / 2)}`,
        pair(`p${4 * i + 1}`, names[4 * i][0], names[4 * i][1]),
        pair(`p${4 * i + 3}`, names[4 * i + 2][0], names[4 * i + 2][1]),
        i === 1 ? { status: 'ONGOING', p1SetsWon: 1, p2SetsWon: 0 } : {},
      ),
    );
  }
  for (let i = 0; i < 2; i++) {
    stage.push(match(`r3m${i}`, 3, i + 1, 'r4m0', null, null));
  }
  stage.push(match('r4m0', 4, 1, null, null, null));
  return { stage, current: stage.find((m) => m.id === 'r2m1')! };
}

function baseInput(over: Partial<OverlayViewInput> = {}): OverlayViewInput {
  const { stage, current } = doubles16();
  return {
    current,
    branch: 'MAIN',
    stageType: 'SINGLE_ELIMINATION',
    stageMatches: stage,
    tournamentName: 'Giải giao lưu công ty vndc',
    sportName: 'Pickleball',
    expectedMembers: 2,
    ...over,
  };
}

function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
  return out;
}

function expectGolden(name: string, actual: OverlayContent): void {
  const file = path.join(FIXTURE_DIR, `${name}.json`);
  if (process.env.UPDATE_OVERLAY_FIXTURES === '1') {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
  }
  const expected = JSON.parse(fs.readFileSync(file, 'utf8')) as OverlayContent;
  expect(actual).toEqual(expected);
}

describe('buildOverlayContent - H2H', () => {
  it('đủ hai bên: tiêu đề ĐỐI ĐẦU, nhãn vòng, tên cặp', () => {
    const { h2h } = buildOverlayContent(baseInput());
    expect(h2h).not.toBeNull();
    expect(h2h!.title).toBe('ĐỐI ĐẦU');
    expect(h2h!.round).toBe('TỨ KẾT');
    expect(h2h!.left.name).toBe('Vận5a - Vận5b');
    expect(h2h!.right.name).toBe('Vận7a - Vận7b');
    expect(h2h!.left.avatars).toHaveLength(2);
  });

  it('thiếu một bên thì h2h là null', () => {
    const { stage, current } = doubles16();
    const lonely = { ...current, participant2: null };
    const result = buildOverlayContent(
      baseInput({ current: lonely, stageMatches: stage }),
    );
    expect(result.h2h).toBeNull();
  });

  it('đơn: một avatar mỗi bên, tên gọi', () => {
    const current = match(
      'f',
      3,
      1,
      null,
      single('a', 'Nguyễn Văn Danh'),
      single('b', 'Trần Minh Luân'),
    );
    const result = buildOverlayContent(
      baseInput({
        current,
        stageMatches: [current],
        expectedMembers: 1,
      }),
    );
    expect(result.h2h!.left.name).toBe('Danh');
    expect(result.h2h!.right.name).toBe('Luân');
    expect(result.h2h!.round).toBe('CHUNG KẾT');
    expect(result.h2h!.left.avatars).toHaveLength(1);
  });

  it('nhãn vòng cho tranh hạng ba, vòng bảng và loại kép', () => {
    const current = match(
      'x',
      1,
      1,
      null,
      single('a', 'A'),
      single('b', 'B'),
    );
    const roundOf = (over: Partial<OverlayViewInput>): string | null =>
      buildOverlayContent(
        baseInput({ current, stageMatches: [current], ...over }),
      ).h2h!.round;
    expect(roundOf({ branch: 'THIRD_PLACE' })).toBe('TRANH HẠNG BA');
    expect(roundOf({ stageType: 'ROUND_ROBIN', stageMatches: [] })).toBe(
      'VÒNG BẢNG',
    );
    expect(
      roundOf({ stageType: 'DOUBLE_ELIMINATION', stageMatches: [] }),
    ).toBeNull();
  });
});

describe('buildOverlayContent - bracket', () => {
  it('tiêu đề giải và môn viết hoa theo tiếng Việt', () => {
    const { bracket } = buildOverlayContent(baseInput());
    expect(bracket!.title).toBe('GIẢI GIAO LƯU CÔNG TY VNDC');
    expect(bracket!.sport).toBe('PICKLEBALL');
  });

  it.each([
    ['DOUBLE_ELIMINATION'],
    ['ROUND_ROBIN'],
    ['GROUP_STAGE_KNOCKOUT'],
  ])('thể thức %s: bracket null kèm lý do tiếng Việt', (stageType) => {
    const result = buildOverlayContent(baseInput({ stageType }));
    expect(result.bracket).toBeNull();
    expect(result.bracketReason).toEqual(expect.any(String));
    expect(result.bracketReason!.length).toBeGreaterThan(5);
  });

  it('loại trực tiếp nhưng chưa có trận: bracket null kèm lý do', () => {
    const result = buildOverlayContent(baseInput({ stageMatches: [] }));
    expect(result.bracket).toBeNull();
    expect(result.bracketReason).toEqual(expect.any(String));
  });

  it('loại trực tiếp hợp lệ: không có lý do', () => {
    expect(buildOverlayContent(baseInput()).bracketReason).toBeNull();
  });

  it('trận tranh hạng ba: vẫn có sơ đồ nhánh chính, không thẻ nào live', () => {
    const { stage } = doubles16();
    const third = match(
      'third',
      4,
      2,
      null,
      pair('p1', 'A', 'B'),
      pair('p2', 'C', 'D'),
    );
    const result = buildOverlayContent(
      baseInput({ current: third, branch: 'THIRD_PLACE', stageMatches: stage }),
    );
    const cards = result.bracket!.columns.flatMap((c) => c.cards);
    expect(cards.some((c) => c.live)).toBe(false);
    expect(result.bracket!.columns).toHaveLength(4);
  });
});

describe('buildOverlayContent - riêng tư', () => {
  it('không có khoá cấm ở bất kỳ cấp nào, kể cả khi đầu vào mang dữ liệu thừa', () => {
    const { stage, current } = doubles16();
    const dirty = stage.map((m) => ({
      ...m,
      participant1: m.participant1 && {
        ...m.participant1,
        seed: 3,
        members: m.participant1.members.map((x) => ({
          ...x,
          userId: 'u-1',
          email: 'a@b.c',
          phoneNumber: '0900000000',
          eloPoints: 1500,
        })),
      },
    }));
    const result = buildOverlayContent(
      baseInput({
        current: dirty.find((m) => m.id === current.id)!,
        stageMatches: dirty,
      }),
    );
    const keys = collectKeys(result);
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});

describe('buildOverlayContent - fixture vàng dùng chung với Web/Flutter', () => {
  it('đôi 16 cặp, đang xem tứ kết số 2', () => {
    expectGolden('doubles-16-current-qf2', buildOverlayContent(baseInput()));
  });

  it('đơn 8 cặp, đang xem chung kết (3 cột)', () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      single(`s${i + 1}`, `Họ Đấu Thủ${i + 1}`),
    );
    const stage: OverlayMatchInput[] = [];
    for (let i = 0; i < 4; i++) {
      stage.push(
        match(`q${i}`, 1, i + 1, `s${Math.floor(i / 2)}`, players[2 * i], players[2 * i + 1], {
          status: 'COMPLETED',
          winnerId: players[2 * i].id,
          p1SetsWon: 3,
          p2SetsWon: 1,
        }),
      );
    }
    stage.push(
      match('s0', 2, 1, 'f', players[0], players[2], {
        status: 'COMPLETED',
        winnerId: players[0].id,
        p1SetsWon: 3,
        p2SetsWon: 2,
      }),
      match('s1', 2, 2, 'f', players[4], players[6], {
        status: 'COMPLETED',
        winnerId: players[6].id,
        p1SetsWon: 1,
        p2SetsWon: 3,
      }),
    );
    const final = match('f', 3, 1, null, players[0], players[6], {
      status: 'ONGOING',
      p1SetsWon: 1,
      p2SetsWon: 1,
    });
    stage.push(final);
    expectGolden(
      'singles-8-final',
      buildOverlayContent(
        baseInput({ current: final, stageMatches: stage, expectedMembers: 1 }),
      ),
    );
  });

  it('có BYE, chờ kết quả, cặp mới một người và đội 3 người', () => {
    const waiting: OverlayParticipantInput = {
      id: 'w',
      teamName: 'Cặp chờ',
      members: [person('Phạm Văn Chờ')],
    };
    const team3: OverlayParticipantInput = {
      id: 't',
      teamName: 'FC Sân Cỏ',
      members: [person('A B'), person('C D'), person('E F')],
    };
    const bye = match('b', 1, 1, 'f', pair('p1', 'Lê Thị Anh', 'Phạm Quốc Anh'), null, {
      isBye: true,
      status: 'COMPLETED',
      winnerId: 'p1',
    });
    const open = match('o', 1, 2, 'f', waiting, team3);
    const final = match('f', 2, 1, null, null, null);
    expectGolden(
      'bye-tbd-waiting-team3',
      buildOverlayContent(
        baseInput({
          current: open,
          stageMatches: [bye, open, final],
        }),
      ),
    );
  });
});
