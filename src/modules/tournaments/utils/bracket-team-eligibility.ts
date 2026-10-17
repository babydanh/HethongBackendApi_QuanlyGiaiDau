import { and, eq, isNull, lte, or } from 'drizzle-orm';
import * as schema from '../../../database/schema';
import { MIN_DOUBLE_ELIMINATION_PARTICIPANTS } from '../../../common/helpers/bracket-advancement.helper';

/**
 * Đội hợp lệ để vào sơ đồ, dùng chung cho mọi thể thức và mọi môn: đã đăng ký
 * đủ (COMPLETE) và đã đóng phí, hoặc BTC miễn phí, hoặc là VĐV ảo, hoặc miễn
 * phí lúc đăng ký (phí chụp rỗng hoặc <= 0, cùng quy tắc `isRegistrationFeePaid`).
 */
export function eligibleTeamCondition() {
  const participants = schema.tournamentParticipants;
  return and(
    eq(participants.teamStatus, 'COMPLETE'),
    or(
      eq(participants.isMock, true),
      eq(participants.isPaid, true),
      eq(participants.organizerWaivedFee, true),
      isNull(participants.entryFeeAtRegistration),
      lte(participants.entryFeeAtRegistration, '0'),
    ),
  );
}

/** Số đội/cặp tối thiểu và cụm từ thể thức dùng trong thông báo lỗi. */
export const BRACKET_MIN_TEAMS: Record<
  string,
  { min: number; label: string }
> = {
  SINGLE_ELIMINATION: { min: 2, label: 'loại trực tiếp' },
  DOUBLE_ELIMINATION: {
    min: MIN_DOUBLE_ELIMINATION_PARTICIPANTS,
    label: 'loại kép',
  },
  ROUND_ROBIN: { min: 2, label: 'đấu vòng tròn' },
  GROUP_STAGE_KNOCKOUT: { min: 4, label: 'vòng bảng + loại trực tiếp' },
};
