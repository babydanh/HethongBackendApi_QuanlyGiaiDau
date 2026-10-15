/**
 * Hợp đồng của `GET /matches/:id/overlay` (OpenSpec `add-live-overlay-view-model`).
 *
 * Mọi chuỗi hiển thị đã được dựng sẵn ở Backend để Web và Flutter chỉ vẽ.
 * Hợp đồng KHÔNG chứa email, số điện thoại, userId, ELO, seed hay mã trận.
 */

export interface OverlayAvatar {
  url: string | null;
  /** Chữ cái đầu (in hoa) để client vẽ khi chưa có ảnh. */
  initial: string;
}

export interface OverlaySide {
  name: string;
  /** Ví dụ "(chờ đồng đội)" khi nội dung là đôi nhưng mới có một người. */
  note: string | null;
  /** 0-2 phần tử; rỗng khi không có thành viên hoặc từ 3 người trở lên. */
  avatars: OverlayAvatar[];
}

/**
 * H2H = màn GIỚI THIỆU hai bên của trận đang xem (avatar, tên, nhãn vòng). KHÔNG phải thống kê
 * lịch sử đối đầu thắng/thua giữa hai bên; không có seed, ELO hay thành tích.
 */
export interface OverlayH2h {
  title: string;
  /** Nhãn vòng tiếng Việt (CHUNG KẾT, BÁN KẾT, TỨ KẾT, VÒNG 16…, TRANH HẠNG BA, VÒNG BẢNG) hoặc null. */
  round: string | null;
  left: OverlaySide;
  right: OverlaySide;
}

export interface OverlayRow {
  /** null: chưa biết đội (client vẽ "Chờ kết quả"); "BYE" do server ghi. */
  name: string | null;
  note: string | null;
  /** Số set đã thắng, dạng chuỗi; null khi chưa đấu. */
  score: string | null;
  won: boolean;
}

export interface OverlayCard {
  id: string;
  final: boolean;
  live: boolean;
  litNext: boolean;
  nextId: string | null;
  rows: [OverlayRow, OverlayRow];
}

export interface OverlayColumn {
  title: string;
  cards: OverlayCard[];
}

export interface OverlayBracket {
  title: string;
  sport: string;
  columns: OverlayColumn[];
}

/** Phần nội dung được cache; hai cờ hiện/ẩn luôn lấy mới. */
export interface OverlayContent {
  h2h: OverlayH2h | null;
  bracket: OverlayBracket | null;
  bracketReason: string | null;
}

export interface OverlayPayload extends OverlayContent {
  h2hVisible: boolean;
  bracketVisible: boolean;
}

/** Đầu vào thuần của mapper: đã lọc roster (ACTIVE, MAIN) và đã sắp theo thời điểm vào. */
export interface OverlayMemberInput {
  fullName: string | null;
  avatarUrl: string | null;
}

export interface OverlayParticipantInput {
  id: string;
  teamName: string;
  members: OverlayMemberInput[];
}

export interface OverlayMatchInput {
  id: string;
  roundNumber: number;
  matchOrder: number;
  nextMatchId: string | null;
  winnerId: string | null;
  status: string;
  isBye: boolean;
  p1SetsWon: number;
  p2SetsWon: number;
  participant1: OverlayParticipantInput | null;
  participant2: OverlayParticipantInput | null;
}

export type OverlayExpectedMembers = 1 | 2;
