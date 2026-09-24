import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import { UpdateFootballRosterDto } from '../dto/update-football-roster.dto';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentRealtimeService } from './tournament-realtime.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  buildFootballRosterConfirmationNotification,
  buildReservedSlotAssignedNotification,
} from '../../notifications/notification-builder';
import { mapTournamentFormat } from '../utils/tournament-presentation';

@Injectable()
export class TournamentFootballRosterService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly notificationsService: NotificationsService,
    private readonly tournamentRealtimeService: TournamentRealtimeService,
  ) {}
  async confirmRoster(id: string, userId: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    if (!(await this.tournamentAccessService.isManager(tournament, userId, systemRoles))) {
      throw new ForbiddenException(
        'Bạn không có quyền chốt danh sách giải đấu này',
      );
    }
    const config = (tournament.tournamentConfig || {}) as Record<
      string,
      unknown
    >;
    const isLegacyLite =
      config.mode === 'LITE' && config.hideAdvancedSettings === true;
    if (config.isLite !== true && !isLegacyLite) {
      throw new BadRequestException(
        'Chỉ giải đấu Lite mới hỗ trợ chốt danh sách hiện tại',
      );
    }
    if (
      !['REGISTRATION_OPEN', 'REGISTRATION_CLOSED'].includes(tournament.status)
    ) {
      throw new BadRequestException(
        'Chỉ có thể chốt danh sách khi giải đang mở hoặc đã đóng đăng ký',
      );
    }
    const updated = await this.tournamentsRepository.update(id, userId, {
      isRegistrationLocked: true,
    });
    return mapTournamentFormat(updated);
  }
  async lockParticipantRoster(
    tournamentId: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    if (
      !['REGISTRATION_CLOSED', 'UPCOMING', 'IN_PROGRESS', 'ONGOING'].includes(
        tournament.status,
      )
    ) {
      throw new BadRequestException(
        'Chỉ được khóa roster sau khi đóng đăng ký.',
      );
    }
    if (!(await this.tournamentAccessService.isManager(tournament, userId, systemRoles))) {
      throw new ForbiddenException('Bạn không có quyền khóa roster.');
    }
    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    if (!participant || participant.tournamentId !== tournamentId) {
      throw new NotFoundException('Người tham gia không tồn tại');
    }
    // The repository locks the participant and its football entry in one
    // transaction. Keeping the status check there prevents a member response
    // racing with the lock request from leaving the two records inconsistent.
    const updated = await this.tournamentsRepository.lockParticipantRoster(
      participantId,
      userId,
    );
    this.tournamentRealtimeService.broadcastRegistrationChanged(tournamentId, {
      participantId,
      divisionId: participant.tournamentDivisionId,
      action: 'ROSTER_LOCKED',
    });
    return updated;
  }
  async unlockParticipantRoster(
    tournamentId: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    if (!['REGISTRATION_CLOSED', 'UPCOMING'].includes(tournament.status)) {
      throw new BadRequestException(
        'Chỉ được mở khóa roster trước khi giải bắt đầu.',
      );
    }
    if (!(await this.tournamentAccessService.isManager(tournament, userId, systemRoles))) {
      throw new ForbiddenException('Bạn không có quyền mở khóa roster.');
    }
    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    if (!participant || participant.tournamentId !== tournamentId) {
      throw new NotFoundException('Người tham gia không tồn tại');
    }
    if (!participant.footballTeamId) {
      throw new BadRequestException(
        'Chỉ đăng ký đội bóng mới có roster để mở khóa.',
      );
    }
    const updated = await this.tournamentsRepository.unlockParticipantRoster(
      participantId,
      userId,
    );
    this.tournamentRealtimeService.broadcastRegistrationChanged(tournamentId, {
      participantId,
      divisionId: participant.tournamentDivisionId,
      action: 'ROSTER_UNLOCKED',
    });
    return updated;
  }
  async getFootballRosterStatus(
    tournamentId: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    if (
      !participant ||
      participant.tournamentId !== tournamentId ||
      !participant.footballTeamId
    ) {
      throw new NotFoundException('Đăng ký đội bóng không tồn tại.');
    }
    const result =
      await this.tournamentsRepository.findFootballEntryForParticipant(
        participantId,
      );
    if (!result?.entry) return { entry: null, roster: [] };
    const roster = await this.tournamentsRepository.getFootballEntryRoster(
      result.entry.id,
    );
    const current = roster.find((member) => member.userId === userId);
    const canManage = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    const teamAccess = participant.footballTeamId
      ? await this.tournamentsRepository.findFootballTeamForRegistration(
          participant.footballTeamId,
          userId,
        )
      : null;
    const canManageTeam = Boolean(
      teamAccess && ['CAPTAIN', 'MANAGER'].includes(teamAccess.membership.role),
    );
    if (!current && !canManage && !canManageTeam) {
      throw new ForbiddenException(
        'Bạn không có quyền xem roster của đội này.',
      );
    }
    return {
      entry: result.entry,
      roster,
      currentMember: current ?? null,
    };
  }
  async respondFootballRoster(
    tournamentId: string,
    participantId: string,
    userId: string,
    action: 'CONFIRM' | 'DECLINE',
  ) {
    if (action !== 'CONFIRM' && action !== 'DECLINE') {
      throw new BadRequestException('Hành động xác nhận roster không hợp lệ.');
    }
    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    if (
      !participant ||
      participant.tournamentId !== tournamentId ||
      !participant.footballTeamId
    ) {
      throw new NotFoundException('Đăng ký đội bóng không tồn tại.');
    }
    const result =
      await this.tournamentsRepository.findFootballEntryForParticipant(
        participantId,
      );
    if (!result?.entry)
      throw new NotFoundException('Roster đội bóng chưa được tạo.');
    if (result.entry.status === 'LOCKED') {
      throw new BadRequestException(
        'Roster đã khóa, không thể thay đổi xác nhận.',
      );
    }
    const updated = await this.tournamentsRepository.respondFootballRoster(
      result.entry.id,
      userId,
      action,
    );
    this.tournamentRealtimeService.broadcastRegistrationChanged(tournamentId, {
      participantId,
      divisionId: participant.tournamentDivisionId,
      action: 'ROSTER_UPDATED',
    });
    return updated;
  }
  async updateFootballRoster(
    tournamentId: string,
    participantId: string,
    dto: UpdateFootballRosterDto,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    if (
      !['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'UPCOMING'].includes(
        tournament.status,
      )
    ) {
      throw new BadRequestException(
        'Chỉ được cập nhật roster trước khi giải bắt đầu.',
      );
    }

    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    if (
      !participant ||
      participant.tournamentId !== tournamentId ||
      !participant.footballTeamId
    ) {
      throw new NotFoundException('Đăng ký đội bóng không tồn tại.');
    }
    const entryResult =
      await this.tournamentsRepository.findFootballEntryForParticipant(
        participantId,
      );
    if (!entryResult?.entry)
      throw new NotFoundException('Roster đội bóng chưa được tạo.');
    if (entryResult.entry.status === 'LOCKED' || participant.rosterLockedAt) {
      throw new BadRequestException('Roster đã khóa, không thể thay đổi.');
    }
    if (
      !['PENDING', 'PENDING_APPROVAL', 'COMPLETE', 'APPROVED'].includes(
        participant.teamStatus,
      )
    ) {
      throw new BadRequestException(
        'Đăng ký đội bóng đã kết thúc hoặc không còn hiệu lực, không thể sửa roster.',
      );
    }

    const previousRoster =
      await this.tournamentsRepository.getFootballEntryRoster(
        entryResult.entry.id,
      );
    const previousConfirmationByUser = new Map(
      previousRoster.map((member) => [
        member.userId,
        member.confirmationStatus,
      ]),
    );

    const manager = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!manager) {
      const team =
        await this.tournamentsRepository.findFootballTeamForRegistration(
          participant.footballTeamId,
          userId,
        );
      if (!team || !['CAPTAIN', 'MANAGER'].includes(team.membership.role)) {
        throw new ForbiddenException(
          'Chỉ đội trưởng, quản lý đội hoặc ban tổ chức mới được sửa roster.',
        );
      }
    }

    const updated = await this.tournamentsRepository.updateFootballRoster(
      participantId,
      dto.memberIds ?? [],
      dto.reserveMemberIds ?? [],
      userId,
    );

    const newlyPendingMemberIds = (updated.roster ?? [])
      .filter(
        (member) =>
          member.confirmationStatus === 'PENDING' &&
          member.userId !== userId &&
          previousConfirmationByUser.get(member.userId) !== 'PENDING',
      )
      .map((member) => member.userId);
    if (newlyPendingMemberIds.length > 0) {
      try {
        await Promise.all(newlyPendingMemberIds.map((receiverId) =>
          this.notificationsService.sendNotification(
            buildFootballRosterConfirmationNotification({
              receiverId,
              tournamentId,
              tournamentName: tournament.name,
              divisionId: participant.tournamentDivisionId ?? undefined,
              participantId,
            }),
          ),
        ));
      } catch (error) {
        console.error(
          'Failed to send football roster update confirmation notifications:',
          error,
        );
      }
    }

    this.tournamentRealtimeService.broadcastRegistrationChanged(tournamentId, {
      participantId,
      divisionId: participant.tournamentDivisionId,
      action: 'ROSTER_UPDATED',
    });
    return updated;
  }
  async assignReservedSlot(
    tournamentId: string,
    userEmailOrPhone: string,
    teamName: string,
    userId: string,
    systemRoles: string[] = [],
    partnerEmailOrPhone?: string,
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền cấp đặc cách');
    }

    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException(
        'Giải đấu đã chốt danh sách, không thể gán slot giữ chỗ.',
      );
    }

    const foundUser =
      await this.tournamentsRepository.findUserByEmailOrPhone(userEmailOrPhone);
    if (!foundUser) {
      throw new NotFoundException(
        'Không tìm thấy tài khoản Sporto cho người chơi thứ nhất',
      );
    }

    let foundPartnerId: string | undefined = undefined;
    if (partnerEmailOrPhone) {
      const foundPartner =
        await this.tournamentsRepository.findUserByEmailOrPhone(
          partnerEmailOrPhone,
        );
      if (!foundPartner) {
        throw new NotFoundException(
          'Không tìm thấy tài khoản Sporto cho đồng đội (người thứ 2)',
        );
      }
      if (foundPartner.id === foundUser.id) {
        throw new BadRequestException(
          'Tài khoản đồng đội phải khác tài khoản người chơi thứ nhất',
        );
      }
      foundPartnerId = foundPartner.id;
    }

    const assignedParticipant =
      await this.tournamentsRepository.assignReservedSlot(
        tournamentId,
        foundUser.id,
        teamName,
        foundPartnerId,
        divisionId,
      );

    try {
      await this.notificationsService.sendNotification(
        buildReservedSlotAssignedNotification({
          receiverId: foundUser.id,
          tournamentId,
          tournamentName: tournament.name,
          divisionId: assignedParticipant.tournamentDivisionId,
        }),
      );

      if (foundPartnerId) {
        await this.notificationsService.sendNotification(
          buildReservedSlotAssignedNotification({
            receiverId: foundPartnerId,
            tournamentId,
            tournamentName: tournament.name,
            divisionId: assignedParticipant.tournamentDivisionId,
          }),
        );
      }
    } catch (err) {
      console.error('Failed to send reserved slot notification:', err);
    }

    return assignedParticipant;
  }
}
