import { ForbiddenException, Injectable } from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';

const ACTIVE_COMMUNITY_MEMBER_STATUSES: string[] = ['JOINED', 'ACTIVE'];
const COMMUNITY_MANAGER_ROLES: string[] = ['OWNER', 'MODERATOR'];

/**
 * Điều kiện duy nhất để thành viên CLB được quản lý giải của CLB đó: còn hiệu lực
 * (JOINED/ACTIVE) và là OWNER/MODERATOR. Đã rời (không còn dòng), BANNED, PENDING,
 * INVITED, REJECTED đều không đủ điều kiện.
 */
export function isActiveCommunityManager(
  member: { role: string; status: string } | null | undefined,
): boolean {
  if (!member) return false;
  if (!ACTIVE_COMMUNITY_MEMBER_STATUSES.includes(member.status)) return false;
  return COMMUNITY_MANAGER_ROLES.includes(member.role.toUpperCase());
}

@Injectable()
export class TournamentAccessService {
  constructor(private readonly tournamentsRepository: TournamentsRepository) {}

  async isManager(
    tournament: {
      id: string;
      createdBy: string | null;
      communityId?: string | null;
    },
    userId: string,
    systemRoles: string[] = [],
  ): Promise<boolean> {
    if (systemRoles.includes('ADMIN')) return true;
    if (tournament.createdBy === userId) return true;
    if (
      typeof this.tournamentsRepository.isCoOrganizer === 'function' &&
      (await this.tournamentsRepository.isCoOrganizer(tournament.id, userId))
    ) {
      return true;
    }
    if (!tournament.communityId) return false;
    const member = await this.tournamentsRepository.findCommunityMember(
      tournament.communityId,
      userId,
    );
    return isActiveCommunityManager(member);
  }

  isSystemTournamentCreator(systemRoles: string[] = []): boolean {
    return systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
  }

  async assertCommunityTournamentCreator(
    communityId: string,
    userId: string,
    systemRoles: string[] = [],
  ): Promise<void> {
    if (systemRoles.includes('ADMIN')) return;
    const member = await this.tournamentsRepository.findCommunityMember(
      communityId,
      userId,
    );
    if (!isActiveCommunityManager(member)) {
      throw new ForbiddenException(
        'Chỉ Chủ CLB hoặc Quản trị viên CLB mới có thể tạo giải thuộc CLB.',
      );
    }
  }
}
