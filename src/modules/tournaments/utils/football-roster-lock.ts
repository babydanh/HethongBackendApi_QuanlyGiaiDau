import { BadRequestException } from '@nestjs/common';

export interface FootballRosterLockState {
  entryExists: boolean;
  entryStatus?: string | null;
  confirmations: Array<'PENDING' | 'CONFIRMED' | 'DECLINED'>;
  mainRosterCount: number;
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
  if (state.mainRosterCount < 1) {
    throw new BadRequestException(
      'Roster đội bóng phải có ít nhất một cầu thủ chính.',
    );
  }
  if (state.confirmations.some((status) => status !== 'CONFIRMED')) {
    throw new BadRequestException('Roster vẫn còn thành viên chưa xác nhận.');
  }
}
