import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  buildParticipantRegistrationRejectedNotification,
  buildParticipantRegistrationSuccessNotification,
} from '../../notifications/notification-builder';
import { isLiteRegistrationTournament } from '../utils/registration-payment-eligibility';
import { resolveDoublesParticipantStatus } from '../utils/tournament-participant-status';

export type RegistrationChanged = (
  tournamentId: string,
  payload: {
    participantId?: string;
    divisionId?: string | null;
    action: string;
  },
) => void;

@Injectable()
export class TournamentParticipantAdminService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly notificationsService: NotificationsService,
  ) {}
  async seedMockParticipants(
    tournamentId: string,
    userId: string,
    names: string[],
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isLite =
      (
        tournament.tournamentConfig as
          | Record<string, unknown>
          | null
          | undefined
      )?.isLite === true;
    if (
      tournament.status !== 'DRAFT' &&
      !isLite &&
      tournament.status !== 'REGISTRATION_OPEN' &&
      tournament.status !== 'UPCOMING'
    ) {
      throw new BadRequestException(
        'Chỉ có thể tạo dữ liệu ảo khi giải đấu ở trạng thái Nháp hoặc Mở đăng ký.',
      );
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền tạo dữ liệu ảo');
    }

    return this.tournamentsRepository.seedMockParticipants(
      tournamentId,
      names,
      divisionId,
    );
  }

  async clearMockParticipants(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isLite =
      (
        tournament.tournamentConfig as
          | Record<string, unknown>
          | null
          | undefined
      )?.isLite === true;
    if (
      tournament.status !== 'DRAFT' &&
      !isLite &&
      tournament.status !== 'REGISTRATION_OPEN' &&
      tournament.status !== 'UPCOMING'
    ) {
      throw new BadRequestException(
        'Chỉ có thể xóa dữ liệu ảo ở trạng thái Nháp hoặc Đang mở đăng ký.',
      );
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xóa dữ liệu ảo');
    }

    return this.tournamentsRepository.clearMockParticipants(
      tournamentId,
      divisionId,
    );
  }

  async deleteMockParticipant(
    tournamentId: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
    broadcastRegistrationChanged: RegistrationChanged,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isLite =
      (
        tournament.tournamentConfig as
          | Record<string, unknown>
          | null
          | undefined
      )?.isLite === true;
    if (
      tournament.status !== 'DRAFT' &&
      !isLite &&
      tournament.status !== 'REGISTRATION_OPEN' &&
      tournament.status !== 'UPCOMING'
    ) {
      throw new BadRequestException(
        'Chỉ có thể xoá dữ liệu giả lập ở trạng thái Nháp hoặc Đang mở đăng ký.',
      );
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xóa người tham gia ảo');
    }

    const result = await this.tournamentsRepository.deleteMockParticipant(
      tournamentId,
      participantId,
    );
    broadcastRegistrationChanged(tournamentId, {
      participantId,
      action: 'PARTICIPANT_REMOVED',
    });
    return result;
  }
  async updateParticipantStatus(
    tournamentId: string,
    participantId: string,
    status: string,
    userId: string,
    systemRoles: string[] = [],
    broadcastRegistrationChanged: RegistrationChanged,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException(
        'Giải đấu đã chốt danh sách, không thể duyệt hoặc từ chối vận động viên.',
      );
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền cập nhật trạng thái');
    }

    if (status !== 'COMPLETE' && status !== 'REJECTED') {
      throw new BadRequestException(
        'Chỉ hỗ trợ duyệt hoặc từ chối hồ sơ đăng ký.',
      );
    }

    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    if (!participant || participant.tournamentId !== tournamentId) {
      throw new NotFoundException('Người tham gia không tồn tại');
    }

    if (participant.teamStatus !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        'Chỉ hồ sơ đang chờ duyệt mới được phép duyệt hoặc từ chối.',
      );
    }

    let nextStatus = status;
    let participantRosters: Array<{ userId: string }> | null = null;
    if (status === 'COMPLETE') {
      const division = participant.tournamentDivisionId
        ? await this.tournamentsRepository.findDivisionById(
            participant.tournamentDivisionId,
          )
        : null;
      participantRosters =
        await this.tournamentsRepository.getParticipantRosters(participantId);
      const tournamentConfig = (tournament.tournamentConfig || {}) as Record<
        string,
        unknown
      >;
      const matchType = division?.matchType ?? tournament.matchType;
      nextStatus = resolveDoublesParticipantStatus({
        event: 'APPROVE',
        registrationMode: tournamentConfig.registrationMode,
        isDoubles:
          matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES',
        rosterCount: participantRosters.length,
        isLite: isLiteRegistrationTournament(tournamentConfig),
        pairingMode:
          tournamentConfig.doublesPairingMode === 'SELF' ? 'SELF' : 'ORGANIZER',
        hasPartnerInvite: Boolean(participant.teamInviteToken),
      });

      if (nextStatus === 'COMPLETE') {
        if (!participant.isPaid) {
          const completedPayment =
            await this.tournamentsRepository.findCompletedParticipantPayment(
              participant.id,
            );
          if (completedPayment) {
            await this.tournamentsRepository.markParticipantPaid(participant.id);
            participant.isPaid = true;
          }
        }

        const entryFeeAmount =
          participant.entryFeeAtRegistration != null
            ? Number(participant.entryFeeAtRegistration)
            : division?.entryFeeOverrideEnabled === true &&
                division.entryFee != null
              ? Number(division.entryFee)
              : Number(tournament.entryFee ?? 0);

        if (entryFeeAmount > 0 && !participant.isPaid) {
          throw new BadRequestException(
            'Hồ sơ có lệ phí chưa thanh toán, không thể duyệt hoàn tất.',
          );
        }
      }
    }

    let updated = await this.tournamentsRepository.updateParticipantStatus(
      participantId,
      nextStatus,
    );
    if (!updated) {
      throw new NotFoundException('Người tham gia không tồn tại');
    }

    if (nextStatus === 'COMPLETE') {
      try {
        updated =
          (await this.tournamentsRepository.assignNextAvailableSeed(
            tournamentId,
            updated.id,
          )) ?? updated;
      } catch (err) {
        // Approval is already persisted; seed assignment is deliberately
        // best-effort so a transient seed-write failure cannot undo approval.
        console.error(
          'Failed to assign next available seed after participant approval:',
          err,
        );
      }
    }

    try {
      const rosters =
        participantRosters ??
        (await this.tournamentsRepository.getParticipantRosters(participantId));
      for (const roster of rosters) {
        if (nextStatus === 'COMPLETE') {
          await this.notificationsService.sendNotification(
            buildParticipantRegistrationSuccessNotification({
              receiverId: roster.userId,
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              divisionId: updated.tournamentDivisionId,
            }),
          );
        } else if (status === 'REJECTED') {
          await this.notificationsService.sendNotification(
            buildParticipantRegistrationRejectedNotification({
              receiverId: roster.userId,
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              divisionId: updated.tournamentDivisionId,
            }),
          );
        }
      }
    } catch (err) {
      console.error(
        'Failed to send notification for updateParticipantStatus:',
        err,
      );
    }

    broadcastRegistrationChanged(tournamentId, {
      participantId: updated.id,
      divisionId: updated.tournamentDivisionId,
      action: status === 'COMPLETE' ? 'APPROVED' : 'REJECTED',
    });

    return updated;
  }
}
