import { ForbiddenException, Injectable } from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';

const ACTIVE_COMMUNITY_MEMBER_STATUSES: string[] = ['JOINED', 'ACTIVE'];
const COMMUNITY_MANAGER_ROLES: string[] = ['OWNER', 'MODERATOR'];

/**
 * Thành viên CLB còn hiệu lực (JOINED/ACTIVE, mọi role). Đã rời (không còn dòng),
 * BANNED, PENDING, INVITED, REJECTED đều không đủ điều kiện.
 */
export function isActiveCommunityMember(
  member: { status: string } | null | undefined,
): boolean {
  if (!member) return false;
  return ACTIVE_COMMUNITY_MEMBER_STATUSES.includes(member.status);
}

/**
 * Điều kiện duy nhất để thành viên CLB được quản lý giải của CLB đó: còn hiệu lực
 * và là OWNER/MODERATOR.
 */
export function isActiveCommunityManager(
  member: { role: string; status: string } | null | undefined,
): boolean {
  if (!member || !isActiveCommunityMember(member)) return false;
  return COMMUNITY_MANAGER_ROLES.includes(member.role.toUpperCase());
}

/**
 * Người tạo giải còn quyền theo giải. Giải không thuộc CLB: createdBy là đủ.
 * Giải thuộc CLB: người tạo phải còn là thành viên CLB hiệu lực (mọi role).
 * Đã rời CLB, BANNED, PENDING... thì mất quyền quản lý.
 */
export async function isTournamentCreatorInForce(
  tournament: { createdBy: string | null; communityId?: string | null },
  userId: string,
  membership: {
    findCommunityMember(
      communityId: string,
      userId: string,
    ): Promise<{ status: string } | null | undefined>;
  },
): Promise<boolean> {
  if (!tournament.createdBy || tournament.createdBy !== userId) return false;
  if (!tournament.communityId) return true;
  const member = await membership.findCommunityMember(
    tournament.communityId,
    userId,
  );
  return isActiveCommunityMember(member);
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
    if (await this.isCreatorInForce(tournament, userId)) return true;
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

  /**
   * Quyền người tạo giải theo trạng thái thành viên CLB hiện tại
   * (xem isTournamentCreatorInForce).
   */
  isCreatorInForce(
    tournament: { createdBy: string | null; communityId?: string | null },
    userId: string,
  ): Promise<boolean> {
    return isTournamentCreatorInForce(tournament, userId, this.tournamentsRepository);
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
