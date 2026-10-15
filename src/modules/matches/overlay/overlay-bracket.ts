import { buildSide } from './overlay-name';
import type {
  OverlayBracket,
  OverlayCard,
  OverlayColumn,
  OverlayExpectedMembers,
  OverlayMatchInput,
  OverlayParticipantInput,
  OverlayRow,
} from './overlay.types';

/** Số cột tối đa của sơ đồ trên video. */
const MAX_COLUMNS = 4;

/** 0 CHUNG KẾT, 1 BÁN KẾT, 2 TỨ KẾT, từ 3 trở đi "VÒNG n" theo số đội còn lại. */
export function roundLabelByDistance(distance: number): string {
  switch (distance) {
    case 0:
      return 'CHUNG KẾT';
    case 1:
      return 'BÁN KẾT';
    case 2:
      return 'TỨ KẾT';
    default:
      return `VÒNG ${2 ** (distance + 1)}`;
  }
}

function distinctRounds(matches: OverlayMatchInput[]): number[] {
  return [...new Set(matches.map((match) => match.roundNumber))].sort(
    (a, b) => a - b,
  );
}

/** Khoảng cách tới chung kết của một vòng (0 = chung kết); null nếu vòng không có trong danh sách. */
export function roundDistance(
  matches: OverlayMatchInput[],
  roundNumber: number,
): number | null {
  const rounds = distinctRounds(matches);
  const index = rounds.indexOf(roundNumber);
  return index < 0 ? null : rounds.length - 1 - index;
}

function toRow(
  match: OverlayMatchInput,
  participant: OverlayParticipantInput | null,
  setsWon: number,
  expectedMembers: OverlayExpectedMembers,
): OverlayRow {
  if (!participant) {
    return {
      name: match.isBye ? 'BYE' : null,
      note: null,
      score: null,
      won: false,
    };
  }
  const side = buildSide(participant, expectedMembers);
  const played = match.status !== 'SCHEDULED' && !match.isBye;
  return {
    name: side.name,
    note: side.note,
    score: played ? String(setsWon) : null,
    won: match.winnerId !== null && participant.id === match.winnerId,
  };
}

/** Id các trận từ trận đang xem đi theo nextMatchId tới hết nhánh (chặn vòng lặp bằng số vòng). */
function pathFrom(
  current: OverlayMatchInput | undefined,
  byId: Map<string, OverlayMatchInput>,
  maxLength: number,
): Set<string> {
  const path = new Set<string>();
  let cursor = current;
  while (cursor && path.size < maxLength && !path.has(cursor.id)) {
    path.add(cursor.id);
    cursor = cursor.nextMatchId ? byId.get(cursor.nextMatchId) : undefined;
  }
  return path;
}

/**
 * Sơ đồ nhánh tối đa 4 cột chứa trận đang xem. T = số vòng, k = vòng của trận `currentMatchId`
 * (đánh số từ 1; trận ngoài sơ đồ dùng k = T): cột cuối = min(T, k+3), cột đầu = cuối − min(4,T) + 1.
 * Trả null khi không có trận nào.
 */
export function buildOverlayBracket(args: {
  matches: OverlayMatchInput[];
  currentMatchId: string;
  title: string;
  sport: string;
  expectedMembers: OverlayExpectedMembers;
}): OverlayBracket | null {
  const { matches, currentMatchId, title, sport, expectedMembers } = args;
  if (matches.length === 0) return null;

  const rounds = distinctRounds(matches);
  const total = rounds.length;
  const byId = new Map(matches.map((match) => [match.id, match]));
  const current = byId.get(currentMatchId);
  const currentIndex = current ? rounds.indexOf(current.roundNumber) + 1 : total;

  const last = Math.min(total, currentIndex + (MAX_COLUMNS - 1));
  const first = last - Math.min(MAX_COLUMNS, total) + 1;

  const shownRounds = new Set(rounds.slice(first - 1, last));
  const shownIds = new Set(
    matches
      .filter((match) => shownRounds.has(match.roundNumber))
      .map((match) => match.id),
  );
  const litPath = pathFrom(current, byId, total);

  const toCard = (match: OverlayMatchInput, isFinalRound: boolean): OverlayCard => ({
    id: match.id,
    final: isFinalRound,
    live: match.id === currentMatchId,
    litNext:
      litPath.has(match.id) &&
      match.nextMatchId !== null &&
      byId.has(match.nextMatchId),
    nextId:
      match.nextMatchId !== null && shownIds.has(match.nextMatchId)
        ? match.nextMatchId
        : null,
    rows: [
      toRow(match, match.participant1, match.p1SetsWon, expectedMembers),
      toRow(match, match.participant2, match.p2SetsWon, expectedMembers),
    ],
  });

  const columns: OverlayColumn[] = [];
  for (let position = first; position <= last; position++) {
    const roundNumber = rounds[position - 1];
    const cards = matches
      .filter((match) => match.roundNumber === roundNumber)
      .sort((a, b) => a.matchOrder - b.matchOrder)
      .map((match) => toCard(match, position === total));
    columns.push({ title: roundLabelByDistance(total - position), cards });
  }

  return { title, sport, columns };
}
