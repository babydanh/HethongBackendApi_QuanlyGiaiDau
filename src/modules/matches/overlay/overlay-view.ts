import {
  buildOverlayBracket,
  roundDistance,
  roundLabelByDistance,
} from './overlay-bracket';
import { buildSide, normalizeText } from './overlay-name';
import type {
  OverlayContent,
  OverlayExpectedMembers,
  OverlayH2h,
  OverlayMatchInput,
} from './overlay.types';

export const H2H_TITLE = 'ĐỐI ĐẦU';

const SINGLE_ELIMINATION = 'SINGLE_ELIMINATION';
const ROUND_ROBIN = 'ROUND_ROBIN';

const UNSUPPORTED_REASONS: Record<string, string> = {
  DOUBLE_ELIMINATION: 'Giải loại kép chưa hỗ trợ sơ đồ nhánh trên video.',
  [ROUND_ROBIN]: 'Giải vòng bảng không có sơ đồ nhánh.',
};
const DEFAULT_UNSUPPORTED_REASON =
  'Chưa hỗ trợ sơ đồ nhánh cho thể thức này.';
const EMPTY_BRACKET_REASON = 'Chưa có sơ đồ nhánh cho nội dung này.';

export interface OverlayViewInput {
  /** Trận đang xem (`:id`). */
  current: OverlayMatchInput;
  /** `matches.bracketBranch` của trận đang xem. */
  branch: string;
  stageType: string;
  /** Các trận nhánh chính của stage; chỉ cần khi `stageType` là loại trực tiếp. */
  stageMatches: OverlayMatchInput[];
  tournamentName: string;
  sportName: string;
  expectedMembers: OverlayExpectedMembers;
}

const upperVi = (text: string): string =>
  normalizeText(text).toLocaleUpperCase('vi');

function h2hRound(input: OverlayViewInput): string | null {
  const branch = input.branch.toUpperCase();
  if (branch === 'THIRD_PLACE') return 'TRANH HẠNG BA';
  if (input.stageType === ROUND_ROBIN) return 'VÒNG BẢNG';
  if (input.stageType === SINGLE_ELIMINATION && branch === 'MAIN') {
    const distance = roundDistance(
      input.stageMatches,
      input.current.roundNumber,
    );
    return distance === null ? null : roundLabelByDistance(distance);
  }
  return null;
}

function buildH2h(input: OverlayViewInput): OverlayH2h | null {
  const { participant1, participant2 } = input.current;
  if (!participant1 || !participant2) return null;
  return {
    title: H2H_TITLE,
    round: h2hRound(input),
    left: buildSide(participant1, input.expectedMembers),
    right: buildSide(participant2, input.expectedMembers),
  };
}

/** Phần nội dung của phản hồi (không gồm hai cờ hiện/ẩn, vì cờ luôn lấy mới). */
export function buildOverlayContent(input: OverlayViewInput): OverlayContent {
  const h2h = buildH2h(input);

  if (input.stageType !== SINGLE_ELIMINATION) {
    return {
      h2h,
      bracket: null,
      bracketReason:
        UNSUPPORTED_REASONS[input.stageType] ?? DEFAULT_UNSUPPORTED_REASON,
    };
  }

  const bracket = buildOverlayBracket({
    matches: input.stageMatches,
    currentMatchId: input.current.id,
    title: upperVi(input.tournamentName),
    sport: upperVi(input.sportName),
    expectedMembers: input.expectedMembers,
  });

  return {
    h2h,
    bracket,
    bracketReason: bracket ? null : EMPTY_BRACKET_REASON,
  };
}
