import { ForbiddenException, Injectable } from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';

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
    if (typeof this.tournamentsRepository.findCommunityById === 'function') {
      const community = await this.tournamentsRepository.findCommunityById(
        tournament.communityId,
      );
      if (community && community.creatorId === userId) {
        return true;
      }
    }
    const member = await this.tournamentsRepository.findCommunityMember(
      tournament.communityId,
      userId,
    );
    return (
      (member?.status === 'JOINED' || member?.status === 'ACTIVE') &&
      ['OWNER', 'MODERATOR'].includes(
        member.role?.toUpperCase?.() ?? member.role,
      )
    );
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
    if (
      !member ||
      member.status !== 'JOINED' ||
      !['OWNER', 'MODERATOR'].includes(member.role)
    ) {
      throw new ForbiddenException(
        'Chỉ Chủ CLB hoặc Quản trị viên CLB mới có thể tạo giải thuộc CLB.',
      );
    }
  }
}
