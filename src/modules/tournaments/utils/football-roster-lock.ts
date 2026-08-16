import { BadRequestException } from '@nestjs/common';

export interface FootballRosterLockState {
  entryExists: boolean;
  entryStatus?: string | null;
  confirmations: Array<'PENDING' | 'CONFIRMED' | 'DECLINED'>;
  mainRosterCount: number;
  requiredMainRosterCount?: number;
}

/** Guard the final transition from a football registration to a locked roster. */
export function assertFootballRosterLockable(
  state: FootballRosterLockState,
): void {
  if (!state.entryExists) {
    throw new BadRequestException('Đăng ký đội bóng chưa có roster để khóa.');
  }
  if (state.entryStatus !== 'CONFIRMED' && state.entryStatus !== 'LOCKED') {
    throw new BadRequestException(
      'Chưa đủ thành viên xác nhận roster để khóa đội.',
    );
  }
  const requiredMainRosterCount = Math.max(
    1,
    state.requiredMainRosterCount ?? 1,
  );
  if (state.mainRosterCount < requiredMainRosterCount) {
    throw new BadRequestException(
      `Roster đội bóng cần đủ ${requiredMainRosterCount} cầu thủ chính để khóa.`,
    );
  }
  if (state.confirmations.some((status) => status !== 'CONFIRMED')) {
    throw new BadRequestException('Roster vẫn còn thành viên chưa xác nhận.');
  }
}
