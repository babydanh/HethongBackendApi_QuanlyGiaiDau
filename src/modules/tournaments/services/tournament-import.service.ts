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
  buildParticipantRegistrationPendingNotification,
  buildParticipantRegistrationSuccessNotification,
} from '../../notifications/notification-builder';
import type { ImportParticipantsDto } from '../dto/import-participants.dto';

@Injectable()
export class TournamentImportService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly notificationsService: NotificationsService,
  ) {}
  async importParticipantsFromForm(
    tournamentId: string,
    userId: string,
    systemRoles: string[],
    dto: ImportParticipantsDto,
    broadcastRegistrationChanged: (
      tournamentId: string,
      payload: { divisionId?: string | null; action: string },
    ) => void,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền nhập danh sách VĐV');
    }

    if (tournament.status === 'COMPLETED') {
      throw new BadRequestException('Giải đấu đã kết thúc');
    }
    if (
      tournament.status === 'REGISTRATION_CLOSED' ||
      tournament.isRegistrationLocked
    ) {
      throw new BadRequestException(
        'Đăng ký đã được khóa. Không thể nhập thêm VĐV hoặc gửi lời mời mới.',
      );
    }

    const result = await this.tournamentsRepository.importParticipants(
      tournamentId,
      userId,
      dto.participants,
      dto.divisionId,
    );

    if (dto.notifyLinkedAccounts && result.linkedAccountNotifications?.length) {
      for (const recipient of result.linkedAccountNotifications) {
        try {
          const notification =
            recipient.status === 'COMPLETE'
              ? buildParticipantRegistrationSuccessNotification({
                  tournamentId,
                  tournamentName: tournament.name,
                  receiverId: recipient.userId,
                  divisionId: recipient.divisionId,
                })
              : buildParticipantRegistrationPendingNotification({
                  tournamentId,
                  tournamentName: tournament.name,
                  receiverId: recipient.userId,
                  divisionId: recipient.divisionId,
                });
          await this.notificationsService.sendNotification(notification);
        } catch {
          // A notification failure must not roll back a successful import.
        }
      }
    }


    broadcastRegistrationChanged(tournamentId, {
      divisionId: dto.divisionId,
      action: 'IMPORT_PARTICIPANTS',
    });

    return {
      message: `Đã thêm ${result.importedCount} VĐV / Đội vào giải đấu!`,
      importedCount: result.importedCount,
    };
  }
}
