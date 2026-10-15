import { NotFoundException } from '@nestjs/common';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { OverlayService } from './overlay.service';
import type {
  OverlayMatchContext,
  OverlayMatchRow,
  OverlayRepository,
} from './overlay.repository';
import type { MatchesRepository } from '../matches.repository';
import type { RedisService } from '../../../providers/redis/redis.service';
import type {
  OverlayParticipantInput,
  OverlayPayload,
} from './overlay.types';

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

const row = (over: Partial<OverlayMatchRow> & Pick<OverlayMatchRow, 'id'>): OverlayMatchRow => ({
  stageId: 'stage-1',
  participant1Id: null,
  participant2Id: null,
  winnerId: null,
  status: 'SCHEDULED',
  isBye: false,
  p1SetsWon: 0,
  p2SetsWon: 0,
  roundNumber: 1,
  matchOrder: 1,
  nextMatchId: null,
  bracketBranch: 'MAIN',
  ...over,
});

const person = (fullName: string | null) => ({ fullName, avatarUrl: null });
const team = (id: string, a: string, b?: string): OverlayParticipantInput => ({
  id,
  teamName: `Cặp ${id}`,
  members: b ? [person(a), person(b)] : [person(a)],
});

/** Giải loại trực tiếp 2 vòng: m1, m2 ở vòng 1; final ở vòng 2. */
function mainRows(): OverlayMatchRow[] {
  return [
    row({ id: 'm1', participant1Id: 'p1', participant2Id: 'p2', nextMatchId: 'final' }),
    row({ id: 'm2', participant1Id: 'p3', participant2Id: 'p4', roundNumber: 1, matchOrder: 2, nextMatchId: 'final' }),
    row({ id: 'final', roundNumber: 2 }),
  ];
}

function contextFor(id: string, over: Partial<OverlayMatchContext> = {}): OverlayMatchContext {
  const found = mainRows().find((r) => r.id === id)!;
  return {
    ...found,
    h2hOverlayVisible: true,
    bracketOverlayVisible: false,
    stageType: 'SINGLE_ELIMINATION',
    tournamentName: 'Giải thử',
    tournamentMatchType: 'DOUBLES',
    divisionMatchType: null,
    categoryName: 'Pickleball',
    ...over,
  };
}

const PARTICIPANTS = new Map<string, OverlayParticipantInput>([
  ['p1', team('p1', 'Nguyễn Văn Danh', 'Trần Minh Luân')],
  ['p2', team('p2', 'Hùng Nguyễn', 'Nam Lê')],
  ['p3', team('p3', 'Duy Phạm', 'Việt Mỹ')],
  ['p4', team('p4', 'Hoàng Vũ', 'Khoa Đặng')],
]);

interface Harness {
  service: OverlayService;
  findContext: jest.Mock;
  findStageMainMatches: jest.Mock;
  findParticipants: jest.Mock;
  canAccess: jest.Mock;
  redisGet: jest.Mock;
  redisSet: jest.Mock;
  redisHgetall: jest.Mock;
  store: Map<string, string>;
}

function harness(
  context: OverlayMatchContext | null = contextFor('m1'),
  participants: Map<string, OverlayParticipantInput> = PARTICIPANTS,
): Harness {
  const store = new Map<string, string>();
  const findContext = jest.fn().mockResolvedValue(context);
  const findStageMainMatches = jest.fn().mockResolvedValue(mainRows());
  const findParticipants = jest.fn().mockResolvedValue(participants);
  const canAccess = jest.fn().mockResolvedValue(true);
  const redisGet = jest.fn((key: string) =>
    Promise.resolve(store.get(key) ?? null),
  );
  const redisSet = jest.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve('OK');
  });
  const redisHgetall = jest.fn().mockResolvedValue({});
  const service = new OverlayService(
    { findContext, findStageMainMatches, findParticipants } as unknown as OverlayRepository,
    { canAccessLiveMatch: canAccess } as unknown as MatchesRepository,
    { get: redisGet, set: redisSet, hgetall: redisHgetall } as unknown as RedisService,
  );
  return {
    service,
    findContext,
    findStageMainMatches,
    findParticipants,
    canAccess,
    redisGet,
    redisSet,
    redisHgetall,
    store,
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

const user = { sub: 'u1', roles: ['PLAYER'], role: 'ADMIN' } as unknown as JwtPayload;

describe('OverlayService.getOverlay - quyền và 404', () => {
  it('trận không tồn tại: 404, không kiểm quyền, không ghi cache', async () => {
    const h = harness(null);
    await expect(h.service.getOverlay('x')).rejects.toBeInstanceOf(NotFoundException);
    expect(h.canAccess).not.toHaveBeenCalled();
    expect(h.redisSet).not.toHaveBeenCalled();
    expect(h.store.size).toBe(0);
  });

  it('không có quyền xem: cùng 404, không dựng nội dung, không ghi cache', async () => {
    const h = harness();
    h.canAccess.mockResolvedValue(false);
    const denied = await h.service.getOverlay('m1').catch((e: Error) => e);
    const missing = await harness(null).service.getOverlay('m1').catch((e: Error) => e);
    expect((denied as Error).message).toBe((missing as Error).message);
    expect(h.findStageMainMatches).not.toHaveBeenCalled();
    expect(h.store.size).toBe(0);
  });

  it('chuyển đúng người dùng và vai trò cho kiểm quyền xem trận', async () => {
    const h = harness();
    await h.service.getOverlay('m1', user);
    expect(h.canAccess).toHaveBeenCalledWith('m1', 'u1', ['PLAYER', 'ADMIN']);
    await h.service.getOverlay('m1');
    expect(h.canAccess).toHaveBeenLastCalledWith('m1', undefined, []);
  });
});

describe('OverlayService.getOverlay - nội dung', () => {
  it('trả hai cờ đã lưu cùng H2H và bracket của giải đôi', async () => {
    const result = await harness().service.getOverlay('m1');
    expect(result.h2hVisible).toBe(true);
    expect(result.bracketVisible).toBe(false);
    expect(result.h2h!.left.name).toBe('Danh - Luân');
    expect(result.h2h!.round).toBe('BÁN KẾT');
    expect(result.bracket!.columns.map((c) => c.title)).toEqual(['BÁN KẾT', 'CHUNG KẾT']);
    expect(result.bracket!.title).toBe('GIẢI THỬ');
    expect(result.bracket!.sport).toBe('PICKLEBALL');
    expect(result.bracketReason).toBeNull();
  });

  it('giải vòng bảng: không truy vấn nhánh chính, bracket null kèm lý do', async () => {
    const h = harness(contextFor('m1', { stageType: 'ROUND_ROBIN' }));
    const result = await h.service.getOverlay('m1');
    expect(h.findStageMainMatches).not.toHaveBeenCalled();
    expect(result.bracket).toBeNull();
    expect(result.bracketReason).toEqual(expect.any(String));
    expect(result.h2h!.round).toBe('VÒNG BẢNG');
  });

  it('trận tranh hạng ba (ngoài nhánh chính): vẫn dựng được H2H và sơ đồ nhánh chính', async () => {
    const third = contextFor('m1', {
      id: 'third',
      bracketBranch: 'THIRD_PLACE',
      participant1Id: 'p1',
      participant2Id: 'p3',
    });
    const h = harness(third);
    const result = await h.service.getOverlay('third');
    expect(result.h2h!.round).toBe('TRANH HẠNG BA');
    expect(result.bracket!.columns.flatMap((c) => c.cards).some((c) => c.live)).toBe(false);
  });

  it('nội dung đôi thiếu người: có ghi chú chờ đồng đội; đơn thì không', async () => {
    const lonely = new Map(PARTICIPANTS);
    lonely.set('p1', team('p1', 'Nguyễn Văn Danh'));
    const doubles = await harness(contextFor('m1', { divisionMatchType: 'MIXED_DOUBLES' }), lonely).service.getOverlay('m1');
    expect(doubles.h2h!.left.note).toBe('(chờ đồng đội)');
    const singles = await harness(
      contextFor('m1', { divisionMatchType: null, tournamentMatchType: 'SINGLES' }),
      lonely,
    ).service.getOverlay('m1');
    expect(singles.h2h!.left.note).toBeNull();
  });

  it('điểm trận đang đánh lấy từ Redis live', async () => {
    const h = harness(contextFor('m1', { status: 'ONGOING' }));
    h.findStageMainMatches.mockResolvedValue(
      mainRows().map((r) => (r.id === 'm1' ? { ...r, status: 'ONGOING' } : r)),
    );
    h.redisHgetall.mockResolvedValue({ p1SetsWon: '2', p2SetsWon: '1' });
    const result = await h.service.getOverlay('m1');
    const card = result.bracket!.columns[0].cards.find((c) => c.id === 'm1')!;
    expect(card.rows.map((r) => r.score)).toEqual(['2', '1']);
    expect(h.redisHgetall).toHaveBeenCalledWith('match:live:m1');
  });

  it('Redis live lỗi: giữ điểm trong DB, không ném lỗi', async () => {
    const h = harness(contextFor('m1', { status: 'ONGOING', p1SetsWon: 1 }));
    h.findStageMainMatches.mockResolvedValue(
      mainRows().map((r) => (r.id === 'm1' ? { ...r, status: 'ONGOING', p1SetsWon: 1 } : r)),
    );
    h.redisHgetall.mockRejectedValue(new Error('redis down'));
    const result = await h.service.getOverlay('m1');
    expect(result.bracket!.columns[0].cards[0].rows[0].score).toBe('1');
  });
});

describe('OverlayService.getOverlay - số truy vấn và cache', () => {
  it('số truy vấn cố định: mỗi loại một lần, không phụ thuộc số trận', async () => {
    const h = harness();
    await h.service.getOverlay('m1');
    expect(h.findContext).toHaveBeenCalledTimes(1);
    expect(h.findStageMainMatches).toHaveBeenCalledTimes(1);
    expect(h.findParticipants).toHaveBeenCalledTimes(1);
    const ids = h.findParticipants.mock.calls[0][0] as string[];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hai lần gọi trong cửa sổ cache chỉ dựng một lần, TTL 3 giây', async () => {
    const h = harness();
    await h.service.getOverlay('m1');
    await h.service.getOverlay('m1');
    expect(h.findStageMainMatches).toHaveBeenCalledTimes(1);
    expect(h.redisSet).toHaveBeenCalledWith('match:overlay:m1', expect.any(String), 3);
  });

  it('hai cờ luôn lấy mới dù nội dung đang nằm trong cache', async () => {
    const h = harness(contextFor('m1', { bracketOverlayVisible: false }));
    const first = await h.service.getOverlay('m1');
    expect(first.bracketVisible).toBe(false);
    h.findContext.mockResolvedValue(
      contextFor('m1', { h2hOverlayVisible: false, bracketOverlayVisible: true }),
    );
    const second = await h.service.getOverlay('m1');
    expect(h.findStageMainMatches).toHaveBeenCalledTimes(1);
    expect(second.bracketVisible).toBe(true);
    expect(second.h2hVisible).toBe(false);
  });

  it('cache lỗi đọc hoặc ghi: vẫn trả kết quả', async () => {
    const h = harness();
    h.redisGet.mockRejectedValue(new Error('get fail'));
    h.redisSet.mockRejectedValue(new Error('set fail'));
    const result = await h.service.getOverlay('m1');
    expect(result.h2h).not.toBeNull();
  });

  it('cache hỏng (không phải JSON): bỏ qua và dựng lại', async () => {
    const h = harness();
    h.store.set('match:overlay:m1', '{không phải json');
    const result = await h.service.getOverlay('m1');
    expect(result.h2h).not.toBeNull();
    expect(h.findStageMainMatches).toHaveBeenCalledTimes(1);
  });
});

describe('OverlayService.getOverlay - riêng tư', () => {
  it('không lộ khoá cấm dù repository trả dữ liệu thừa', async () => {
    const dirty = new Map<string, OverlayParticipantInput>();
    for (const [id, p] of PARTICIPANTS) {
      dirty.set(id, {
        ...p,
        seed: 1,
        members: p.members.map((m) => ({
          ...m,
          userId: 'u',
          email: 'a@b.c',
          phoneNumber: '0900',
          eloPoints: 1500,
        })),
      } as OverlayParticipantInput);
    }
    const result: OverlayPayload = await harness(contextFor('m1'), dirty).service.getOverlay('m1');
    const keys = collectKeys(result);
    for (const forbidden of FORBIDDEN_KEYS) expect(keys.has(forbidden)).toBe(false);
  });
});
