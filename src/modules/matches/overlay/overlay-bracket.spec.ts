import { buildOverlayBracket, roundLabelByDistance } from './overlay-bracket';
import type {
  OverlayBracket,
  OverlayCard,
  OverlayMatchInput,
  OverlayParticipantInput,
} from './overlay.types';

/** Cặp đôi mẫu: p{n} gồm hai thành viên "Họ A{n}" và "Họ B{n}". */
const pair = (n: number): OverlayParticipantInput => ({
  id: `p${n}`,
  teamName: `Cặp ${n}`,
  members: [
    { fullName: `Họ Tên${n}a`, avatarUrl: null },
    { fullName: `Họ Tên${n}b`, avatarUrl: null },
  ],
});

/** Cây loại trực tiếp T vòng: vòng r có 2^(T-r) trận, mã `r{r}m{i}`; chỉ vòng 1 có đội. */
function makeBracket(rounds: number): OverlayMatchInput[] {
  const matches: OverlayMatchInput[] = [];
  for (let r = 1; r <= rounds; r++) {
    const count = 2 ** (rounds - r);
    for (let i = 0; i < count; i++) {
      matches.push({
        id: `r${r}m${i}`,
        roundNumber: r,
        matchOrder: i + 1,
        nextMatchId: r < rounds ? `r${r + 1}m${Math.floor(i / 2)}` : null,
        winnerId: null,
        status: 'SCHEDULED',
        isBye: false,
        p1SetsWon: 0,
        p2SetsWon: 0,
        participant1: r === 1 ? pair(2 * i + 1) : null,
        participant2: r === 1 ? pair(2 * i + 2) : null,
      });
    }
  }
  return matches;
}

const build = (
  matches: OverlayMatchInput[],
  currentMatchId: string,
): OverlayBracket | null =>
  buildOverlayBracket({
    matches,
    currentMatchId,
    title: 'GIẢI THỬ',
    sport: 'PICKLEBALL',
    expectedMembers: 2,
  });

const roundOfCard = (card: OverlayCard) => Number(/^r(\d+)m/.exec(card.id)![1]);
const allCards = (b: OverlayBracket): OverlayCard[] =>
  b.columns.flatMap((c) => c.cards);

describe('roundLabelByDistance', () => {
  it('nhãn tiếng Việt theo khoảng cách tới chung kết', () => {
    expect([0, 1, 2, 3, 4, 5].map(roundLabelByDistance)).toEqual([
      'CHUNG KẾT',
      'BÁN KẾT',
      'TỨ KẾT',
      'VÒNG 16',
      'VÒNG 32',
      'VÒNG 64',
    ]);
  });
});

describe('buildOverlayBracket - cửa sổ cột', () => {
  it('giải 16 cặp, đang xem tứ kết: 4 cột Vòng 16 → Chung kết', () => {
    const bracket = build(makeBracket(4), 'r2m1')!;
    expect(bracket.columns.map((c) => c.title)).toEqual([
      'VÒNG 16',
      'TỨ KẾT',
      'BÁN KẾT',
      'CHUNG KẾT',
    ]);
    expect(bracket.columns.map((c) => c.cards.length)).toEqual([8, 4, 2, 1]);
  });

  it('giải 8 cặp: chỉ 3 cột', () => {
    const bracket = build(makeBracket(3), 'r1m0')!;
    expect(bracket.columns.map((c) => c.title)).toEqual([
      'TỨ KẾT',
      'BÁN KẾT',
      'CHUNG KẾT',
    ]);
  });

  it('giải 32 cặp, đang xem vòng 1: cửa sổ vòng 1-4, không có chung kết', () => {
    const bracket = build(makeBracket(5), 'r1m3')!;
    expect(bracket.columns.map((c) => c.title)).toEqual([
      'VÒNG 32',
      'VÒNG 16',
      'TỨ KẾT',
      'BÁN KẾT',
    ]);
    expect(allCards(bracket).some((c) => c.final)).toBe(false);
  });

  it('giải 64 cặp, đang xem chung kết: 4 vòng cuối', () => {
    const bracket = build(makeBracket(6), 'r6m0')!;
    expect(bracket.columns.map((c) => c.title)).toEqual([
      'VÒNG 16',
      'TỨ KẾT',
      'BÁN KẾT',
      'CHUNG KẾT',
    ]);
  });

  it('bảng ca đủ: T = 1..6, mọi k: độ dài min(4,T), chứa trận đang xem, cột cuối = min(T,k+3)', () => {
    for (let rounds = 1; rounds <= 6; rounds++) {
      const matches = makeBracket(rounds);
      for (let k = 1; k <= rounds; k++) {
        const currentId = `r${k}m0`;
        const bracket = build(matches, currentId)!;
        const roundsShown = bracket.columns.map((c) =>
          roundOfCard(c.cards[0]),
        );
        expect(roundsShown).toHaveLength(Math.min(4, rounds));
        expect(roundsShown).toContain(k);
        expect(roundsShown[roundsShown.length - 1]).toBe(
          Math.min(rounds, k + 3),
        );
        expect(allCards(bracket).filter((c) => c.live)).toHaveLength(1);
      }
    }
  });

  it('trận đang xem không thuộc bracket: 4 vòng cuối, không thẻ nào live', () => {
    const bracket = build(makeBracket(5), 'khong-co-trong-nhanh')!;
    expect(bracket.columns.map((c) => roundOfCard(c.cards[0]))).toEqual([
      2, 3, 4, 5,
    ]);
    expect(allCards(bracket).some((c) => c.live)).toBe(false);
  });

  it('không có trận nào thì không dựng bracket', () => {
    expect(build([], 'x')).toBeNull();
  });

  it('thẻ trong cột sắp theo matchOrder', () => {
    const matches = makeBracket(3).reverse();
    const bracket = build(matches, 'r1m0')!;
    expect(bracket.columns[0].cards.map((c) => c.id)).toEqual([
      'r1m0',
      'r1m1',
      'r1m2',
      'r1m3',
    ]);
  });

  it('mang tiêu đề giải và môn đã dựng sẵn', () => {
    const bracket = build(makeBracket(3), 'r1m0')!;
    expect(bracket.title).toBe('GIẢI THỬ');
    expect(bracket.sport).toBe('PICKLEBALL');
  });
});

describe('buildOverlayBracket - nổi bật trận đang xem', () => {
  it('live, litNext, nextId và final trên đường tới chung kết', () => {
    const bracket = build(makeBracket(4), 'r2m1')!;
    const byId = new Map(allCards(bracket).map((c) => [c.id, c]));
    expect(byId.get('r2m1')).toMatchObject({
      live: true,
      litNext: true,
      nextId: 'r3m0',
      final: false,
    });
    expect(byId.get('r3m0')).toMatchObject({
      live: false,
      litNext: true,
      nextId: 'r4m0',
    });
    expect(byId.get('r4m0')).toMatchObject({
      live: false,
      litNext: false,
      nextId: null,
      final: true,
    });
    expect(byId.get('r2m0')).toMatchObject({ litNext: false, live: false });
    expect(byId.get('r1m3')).toMatchObject({ litNext: false, nextId: 'r2m1' });
  });

  it('cột cuối của cửa sổ chưa tới chung kết: nextId null nhưng litNext vẫn true', () => {
    const bracket = build(makeBracket(5), 'r1m0')!;
    const byId = new Map(allCards(bracket).map((c) => [c.id, c]));
    expect(byId.get('r4m0')).toMatchObject({ nextId: null, litNext: true });
    expect(byId.get('r3m0')).toMatchObject({ nextId: 'r4m0', litNext: true });
  });

  it('chỉ thẻ chung kết có final = true', () => {
    const bracket = build(makeBracket(4), 'r1m0')!;
    expect(allCards(bracket).filter((c) => c.final).map((c) => c.id)).toEqual([
      'r4m0',
    ]);
  });
});

describe('buildOverlayBracket - dòng của thẻ', () => {
  it('thẻ chỉ có id/final/live/litNext/nextId/rows; dòng chỉ có name/note/score/won', () => {
    const card = allCards(build(makeBracket(3), 'r1m0')!)[0];
    expect(Object.keys(card).sort()).toEqual(
      ['final', 'id', 'litNext', 'live', 'nextId', 'rows'].sort(),
    );
    expect(Object.keys(card.rows[0]).sort()).toEqual(
      ['name', 'note', 'score', 'won'].sort(),
    );
  });

  it('tên đôi dạng "Tên - Tên"', () => {
    const card = allCards(build(makeBracket(3), 'r1m0')!)[0];
    expect(card.rows[0].name).toBe('Tên1a - Tên1b');
    expect(card.rows[1].name).toBe('Tên2a - Tên2b');
  });

  it('trận đã xong: điểm là số set thắng, chỉ bên thắng won = true', () => {
    const matches = makeBracket(3);
    Object.assign(matches[0], {
      status: 'COMPLETED',
      winnerId: 'p1',
      p1SetsWon: 2,
      p2SetsWon: 1,
    });
    const card = allCards(build(matches, 'r1m1')!).find((c) => c.id === 'r1m0')!;
    expect(card.rows[0]).toMatchObject({ score: '2', won: true });
    expect(card.rows[1]).toMatchObject({ score: '1', won: false });
  });

  it('bao nhiêu set thắng hiện bấy nhiêu (bo 5: 3-1)', () => {
    const matches = makeBracket(2);
    Object.assign(matches[0], {
      status: 'COMPLETED',
      winnerId: 'p1',
      p1SetsWon: 3,
      p2SetsWon: 1,
    });
    const card = allCards(build(matches, 'r1m0')!).find((c) => c.id === 'r1m0')!;
    expect([card.rows[0].score, card.rows[1].score]).toEqual(['3', '1']);
  });

  it('trận đang diễn ra: hiện số set hiện tại, chưa ai won', () => {
    const matches = makeBracket(3);
    Object.assign(matches[0], {
      status: 'ONGOING',
      p1SetsWon: 1,
      p2SetsWon: 0,
    });
    const card = allCards(build(matches, 'r1m0')!).find((c) => c.id === 'r1m0')!;
    expect(card.rows[0]).toMatchObject({ score: '1', won: false });
    expect(card.rows[1]).toMatchObject({ score: '0', won: false });
  });

  it('trận chưa đấu: điểm null', () => {
    const card = allCards(build(makeBracket(3), 'r1m1')!).find(
      (c) => c.id === 'r1m0',
    )!;
    expect(card.rows[0].score).toBeNull();
    expect(card.rows[1].score).toBeNull();
  });

  it('chưa biết đội: name null, score null, won false', () => {
    const card = allCards(build(makeBracket(3), 'r1m0')!).find(
      (c) => c.id === 'r2m0',
    )!;
    expect(card.rows[0]).toEqual({
      name: null,
      note: null,
      score: null,
      won: false,
    });
  });

  it('trận BYE: bên trống là "BYE", bên có đội thắng không có điểm', () => {
    const matches = makeBracket(3);
    Object.assign(matches[0], {
      isBye: true,
      participant2: null,
      winnerId: 'p1',
      status: 'COMPLETED',
    });
    const card = allCards(build(matches, 'r1m1')!).find((c) => c.id === 'r1m0')!;
    expect(card.rows[1]).toEqual({
      name: 'BYE',
      note: null,
      score: null,
      won: false,
    });
    expect(card.rows[0]).toMatchObject({ score: null, won: true });
  });

  it('cặp mới chỉ có một người: có ghi chú chờ đồng đội ở dòng đó', () => {
    const matches = makeBracket(2);
    matches[0].participant1 = {
      id: 'p1',
      teamName: 'Cặp 1',
      members: [{ fullName: 'Họ Danh', avatarUrl: null }],
    };
    const card = allCards(build(matches, 'r1m0')!).find((c) => c.id === 'r1m0')!;
    expect(card.rows[0]).toMatchObject({
      name: 'Danh',
      note: '(chờ đồng đội)',
    });
  });
});
