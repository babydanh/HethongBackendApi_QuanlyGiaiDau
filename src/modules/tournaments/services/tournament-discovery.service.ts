import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentStatus } from '../../../common/constants/enums';
import { RedisService } from '../../../providers/redis/redis.service';
import { QueryTournamentDto } from '../dto/query-tournament.dto';
import { QueryMyManagementTournamentsDto } from '../dto/query-my-management-tournaments.dto';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import {
  mapPublicTournament,
  mapTournamentFormat,
} from '../utils/tournament-presentation';
import {
  isSuperLiteTournamentProduct,
  normalizeTournamentProductConfig,
} from '../utils/tournament-product';

const PUBLIC_TOURNAMENT_CACHE_VERSION = 'v1';

function serializeTournamentQuery(query: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(query).sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

@Injectable()
export class TournamentDiscoveryService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly redisService: RedisService,
    private readonly tournamentAccessService: TournamentAccessService,
  ) {}
  async findAll(query: QueryTournamentDto) {
    const cacheQuery = {
      ...query,
      visibility: 'PUBLIC' as const,
      createdBy: undefined,
    };
    const cacheKey = `tournaments:list:${serializeTournamentQuery(cacheQuery)}`;
    return this.redisService.getOrSetJson(cacheKey, 60, async () => {
      const result = await this.tournamentsRepository.findAll(
        {
          ...cacheQuery,
        },
        {
          defaultTournamentType: null,
          defaultVisibility: 'PUBLIC',
        },
      );
      result.data = result.data
        .filter((t) => {
          if (
            [
              'DRAFT',
              'PENDING_APPROVAL',
              'SUSPENDED',
              'CANCELLED',
              'PENDING_DELETE',
            ].includes(t.status)
          ) {
            return false;
          }
          // Super Lite tournaments in clubs are strictly internal to the club and must never appear in public tournament listings
          const isClubSuperLite = Boolean(
            t.communityId &&
            isSuperLiteTournamentProduct(
              normalizeTournamentProductConfig(t.tournamentConfig),
            ),
          );
          if (isClubSuperLite) {
            return false;
          }
          return true;
        })
        .map((t) => mapTournamentFormat(t));

      return result;
    });
  }

  async findPublic(query: QueryTournamentDto) {
    const cacheQuery = {
      ...query,
      tournamentType: 'PUBLIC' as const,
      visibility: 'PUBLIC' as const,
      createdBy: undefined,
    };
    const cacheKey = `tournaments:list:public:${PUBLIC_TOURNAMENT_CACHE_VERSION}:${serializeTournamentQuery(cacheQuery)}`;
    // Lấy tất cả tournament hiển thị công khai trên app/web:
    // Mặc định lọc các giải đấu PUBLIC để ẩn giải đấu PRIVATE khỏi trang chủ.
    return this.redisService.getOrSetJson(cacheKey, 60, async () => {
      const result = await this.tournamentsRepository.findAll(
        {
          ...cacheQuery,
        },
        {
          defaultTournamentType: 'PUBLIC',
          defaultVisibility: 'PUBLIC',
        },
      );
      result.data = result.data
        .filter((t) => {
          if (
            [
              'DRAFT',
              'PENDING_APPROVAL',
              'SUSPENDED',
              'CANCELLED',
              'PENDING_DELETE',
            ].includes(t.status)
          ) {
            return false;
          }
          // Super Lite tournaments in clubs are strictly internal to the club and must never appear in public tournament listings
          const isClubSuperLite = Boolean(
            t.communityId &&
            isSuperLiteTournamentProduct(
              normalizeTournamentProductConfig(t.tournamentConfig),
            ),
          );
          if (isClubSuperLite) {
            return false;
          }
          return true;
        })
        .map((t) => mapPublicTournament(mapTournamentFormat(t)));
      return result;
    });
  }

  async findMy(userId: string) {
    const result = await this.tournamentsRepository.findMyTournaments(userId);
    return result.map((t) => mapTournamentFormat(t));
  }

  async findMyManagement(
    userId: string,
    query: QueryMyManagementTournamentsDto,
  ) {
    const result = await this.tournamentsRepository.findMyManagementTournaments(
      userId,
      query,
    );

    return {
      ...result,
      data: result.data.map((item) =>
        item.itemType === 'STANDALONE' ? mapTournamentFormat(item) : item,
      ),
    };
  }

  async getMyWorkspace(userId: string, includeRefereeMatches = true) {
    const workspace = await this.tournamentsRepository.findMyWorkspace(
      userId,
      includeRefereeMatches,
    );

    return {
      ...workspace,
      organizedTournaments: workspace.organizedTournaments.map((tournament) =>
        mapTournamentFormat(tournament),
      ),
      participatingTournaments: workspace.participatingTournaments.map(
        (tournament) => mapTournamentFormat(tournament),
      ),
      coOrganizerTournaments: workspace.coOrganizerTournaments.map(
        (tournament) => mapTournamentFormat(tournament),
      ),
    };
  }

  async findOne(
    id: string,
    userId?: string | null,
    inviteCode?: string,
    systemRoles: string[] = [],
    participantId?: string,
    teamInviteToken?: string,
    managementAccess = false,
  ) {
    const tournament = await this.tournamentsRepository.findById(id, {
      includeInviteCode: true,
    });
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    if (managementAccess) {
      const canManage = userId
        ? await this.tournamentAccessService.isManager(tournament, userId, systemRoles)
        : false;
      if (!canManage) {
        throw new ForbiddenException(
          'Bạn không có quyền quản lý giải đấu này.',
        );
      }
    }

    const isOwner = userId && tournament.createdBy === userId;
    const isAdmin = systemRoles.includes('ADMIN');

    if (
      ['DRAFT', 'PENDING_APPROVAL', 'PENDING_DELETE'].includes(
        tournament.status,
      ) &&
      !isOwner &&
      !isAdmin
    ) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    if (tournament.status === 'SUSPENDED' && !isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Giải đấu đang bị tạm đình chỉ do vi phạm điều khoản dịch vụ',
      );
    }
    if (tournament.status === 'CANCELLED' && !isOwner && !isAdmin) {
      throw new ForbiddenException('Giải đấu đã bị cấm hoặc hủy vĩnh viễn');
    }

    const tourneyConfig = (
      typeof tournament.tournamentConfig === 'string'
        ? (() => {
            try {
              return JSON.parse(tournament.tournamentConfig);
            } catch {
              return {};
            }
          })()
        : tournament.tournamentConfig
    ) as Record<string, unknown> | null | undefined;

    const isClubTournament = Boolean(
      (tournament.communityId && tournament.communityId.length > 0) ||
      tournament.tournamentType === 'CLUB',
    );

    if (tournament.visibility === 'PRIVATE' || isClubTournament) {
      const isInviteMatch = inviteCode && tournament.inviteCode === inviteCode;
      const isValidTeamInvite =
        !!participantId &&
        !!teamInviteToken &&
        (await (async () => {
          const participant =
            await this.tournamentsRepository.findParticipantById(participantId);
          return (
            !!participant &&
            participant.tournamentId === id &&
            participant.teamInviteToken === teamInviteToken
          );
        })());
      let isCommunityMember = false;
      if (tournament.communityId) {
        if (userId) {
          const member = await this.tournamentsRepository.findCommunityMember(
            tournament.communityId,
            userId,
          );
          if (member && member.status === 'JOINED') {
            isCommunityMember = true;
          }
        }
      }
      let isParticipant = false;
      if (userId) {
        isParticipant = await this.tournamentsRepository.isUserParticipant(
          id,
          userId,
        );
      }
      if (
        !isOwner &&
        !isInviteMatch &&
        !isValidTeamInvite &&
        !isAdmin &&
        !isCommunityMember &&
        !isParticipant
      ) {
        throw new ForbiddenException(
          'Giải đấu nội bộ chỉ dành cho thành viên của câu lạc bộ hoặc người có mã mời',
        );
      }
    }

    // Do NOT leak internal inviteCode to non-owner, non-admin viewers
    if (!isOwner && !isAdmin) {
      tournament.inviteCode = null;
    }

    return mapTournamentFormat(tournament);
  }
  async findParticipants(id: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    return this.tournamentsRepository.findPublicParticipants(
      id,
      tournament.categoryId,
      divisionId,
    );
  }

  async findParticipantsForOrganizer(
    id: string,
    divisionId: string | undefined,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    if (!(await this.tournamentAccessService.isManager(tournament, userId, systemRoles))) {
      throw new ForbiddenException(
        'Bạn không có quyền xem hồ sơ đăng ký của giải đấu này.',
      );
    }
    const participants = await this.tournamentsRepository.findParticipants(
      id,
      tournament.categoryId,
      divisionId,
      false,
      true,
    );

    return participants.map((participant) => ({
      ...participant,
      isPaid:
        participant.isPaid ||
        participant.payment?.status === PaymentStatus.COMPLETED,
    }));
  }
}
