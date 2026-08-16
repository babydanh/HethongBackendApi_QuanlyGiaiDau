import { ConflictException } from '@nestjs/common';

export const MAX_ACTIVE_FOOTBALL_TEAMS = 3;

export function assertCanCreateActiveFootballTeam(activeCreatedCount: number) {
  if (activeCreatedCount >= MAX_ACTIVE_FOOTBALL_TEAMS) {
    throw new ConflictException('Bạn đã tạo tối đa 3 đội bóng đang hoạt động.');
  }
}

export function assertCanJoinActiveFootballTeam(activeMembershipCount: number) {
  if (activeMembershipCount >= MAX_ACTIVE_FOOTBALL_TEAMS) {
    throw new ConflictException('Bạn đã tham gia tối đa 3 đội đang hoạt động.');
  }
}
