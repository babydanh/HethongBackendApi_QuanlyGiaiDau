import {
  buildSide,
  normalizeText,
  WAITING_PARTNER_NOTE,
} from './overlay-name';

const member = (fullName: string | null, avatarUrl: string | null = null) => ({
  fullName,
  avatarUrl,
});

describe('normalizeText', () => {
  it('chuẩn hoá NFC, đổi NBSP thành khoảng trắng thường và gộp khoảng trắng', () => {
    // "Lua" + dấu mũ rời → "Luân" dạng NFC; hai NBSP và khoảng trắng đôi.
    expect(normalizeText('  Nguyễn\u00A0\u00A0Minh   Lua\u0302n ')).toBe(
      'Nguyễn Minh Luân',
    );
  });

  it('chuỗi null hoặc undefined thành rỗng', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('buildSide', () => {
  it('đôi bình thường: ghép tên gọi bằng " - "', () => {
    const side = buildSide(
      {
        teamName: 'Cặp A',
        members: [member('Nguyễn Văn Danh'), member('Trần Minh Luân')],
      },
      2,
    );
    expect(side.name).toBe('Danh - Luân');
    expect(side.note).toBeNull();
    expect(side.avatars.map((a) => a.initial)).toEqual(['D', 'L']);
  });

  it('đơn: chỉ tên gọi, không ghi chú', () => {
    const side = buildSide(
      { teamName: 'Danh', members: [member('Nguyễn Văn Danh')] },
      1,
    );
    expect(side.name).toBe('Danh');
    expect(side.note).toBeNull();
    expect(side.avatars).toHaveLength(1);
  });

  it('hai tên gọi trùng nhau thì dùng 2 từ cuối cho cả hai', () => {
    const side = buildSide(
      {
        teamName: 'Cặp B',
        members: [member('Lê Thị Anh'), member('Phạm Quốc Anh')],
      },
      2,
    );
    expect(side.name).toBe('Thị Anh - Quốc Anh');
  });

  it('so sánh trùng không phân biệt hoa thường', () => {
    const side = buildSide(
      {
        teamName: 'Cặp C',
        members: [member('Nguyễn ANH'), member('Trần anh')],
      },
      2,
    );
    expect(side.name).toBe('Nguyễn ANH - Trần anh');
  });

  it('họ tên chỉ một từ: 2 từ cuối vẫn là chính từ đó', () => {
    const side = buildSide(
      { teamName: 'Cặp D', members: [member('Anh'), member('Lê Anh')] },
      2,
    );
    expect(side.name).toBe('Anh - Lê Anh');
  });

  it('đội từ 3 người trở lên dùng teamName và không có avatar', () => {
    const side = buildSide(
      {
        teamName: 'FC Sân Cỏ',
        members: [member('A B'), member('C D'), member('E F')],
      },
      1,
    );
    expect(side.name).toBe('FC Sân Cỏ');
    expect(side.avatars).toEqual([]);
    expect(side.note).toBeNull();
  });

  it('không có thành viên thì dùng teamName', () => {
    const side = buildSide({ teamName: '  Khách  mời ', members: [] }, 2);
    expect(side.name).toBe('Khách mời');
    expect(side.avatars).toEqual([]);
    expect(side.note).toBeNull();
  });

  it('cặp mới chỉ có một người: tên người đó + ghi chú chờ đồng đội', () => {
    const side = buildSide(
      { teamName: 'Cặp E', members: [member('Nguyễn Văn Danh')] },
      2,
    );
    expect(side.name).toBe('Danh');
    expect(side.note).toBe(WAITING_PARTNER_NOTE);
    expect(WAITING_PARTNER_NOTE).toBe('(chờ đồng đội)');
  });

  it('thành viên thiếu tên thì quay về teamName', () => {
    const side = buildSide(
      {
        teamName: 'Cặp F',
        members: [member('Nguyễn Văn Danh'), member('   ')],
      },
      2,
    );
    expect(side.name).toBe('Cặp F');
    expect(side.avatars).toEqual([]);
  });

  it('avatar giữ url, null khi chưa có ảnh, chữ cái đầu in hoa kể cả chữ có dấu', () => {
    const side = buildSide(
      {
        teamName: 'Cặp G',
        members: [
          member('Lê Văn đạt', 'https://cdn.example/a.jpg'),
          member('Trần Bảo'),
        ],
      },
      2,
    );
    expect(side.avatars).toEqual([
      { url: 'https://cdn.example/a.jpg', initial: 'Đ' },
      { url: null, initial: 'B' },
    ]);
  });
});
