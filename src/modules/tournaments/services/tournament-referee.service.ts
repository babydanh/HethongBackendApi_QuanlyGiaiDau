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
  buildRefereeInviteAcceptedNotification,
  buildRefereeInviteDeclinedNotification,
  buildRefereeInviteNotification,
  buildRefereeInviteRevokedNotification,
} from '../../notifications/notification-builder';

@Injectable()
export class TournamentRefereeService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly notificationsService: NotificationsService,
  ) {}
  async findReferees(id: string, userId: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);

    if (!isAuthorized) {
      throw new ForbiddenException(
        'Bạn không có quyền xem danh sách trọng tài của giải đấu này',
      );
    }

    return this.tournamentsRepository.findReferees(id);
  }
  async addReferee(
    id: string,
    email: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);

    if (!isAuthorized) {
      throw new ForbiddenException(
        'Bạn không có quyền mời trọng tài cho giải đấu này',
      );
    }

    const userToInvite =
      await this.tournamentsRepository.findUserByEmail(email);
    if (!userToInvite) {
      throw new NotFoundException(
        'Không tìm thấy tài khoản hệ thống với email đã nhập',
      );
    }

    const existingReferee =
      await this.tournamentsRepository.findRefereeByTournamentAndUser(
        id,
        userToInvite.id,
      );
    if (existingReferee?.status === 'INVITED') {
      throw new BadRequestException(
        'Lời mời trọng tài này vẫn đang chờ người dùng phản hồi.',
      );
    }
    if (existingReferee?.status === 'ACCEPTED') {
      throw new BadRequestException(
        'Người dùng này đã là trọng tài đã xác nhận của giải.',
      );
    }

    const invite = await this.tournamentsRepository.addReferee(
      id,
      userToInvite.id,
      userId,
    );

    try {
      await this.notificationsService.sendNotification(
        buildRefereeInviteNotification({
          tournamentId: id,
          tournamentName: tournament.name,
          receiverId: userToInvite.id,
          refereeId: invite.id,
        }),
      );
    } catch (error) {
      console.error('Failed to send referee invite notification:', error);
    }

    return invite;
  }

  async respondToRefereeInvite(
    tournamentId: string,
    refereeId: string,
    userId: string,
    action: 'ACCEPT' | 'DECLINE',
  ) {
    const referee = await this.tournamentsRepository.findRefereeById(refereeId);
    if (!referee)
      throw new NotFoundException('Không tìm thấy lời mời trọng tài');
    if (referee.userId !== userId)
      throw new ForbiddenException('Bạn không phải người được mời');
    if (referee.status !== 'INVITED')
      throw new BadRequestException('Lời mời đã được phản hồi trước đó');

    const status = action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
    const [tournament, refereeUser] = await Promise.all([
      this.tournamentsRepository.findById(tournamentId),
      this.tournamentsRepository.findUserBasicById(userId),
    ]);

    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    const updatedReferee = await this.tournamentsRepository.updateRefereeStatus(
      refereeId,
      status,
    );

    const organizerReceiverId = referee.assignedBy || tournament.createdBy;
    const refereeName =
      refereeUser?.fullName || refereeUser?.email || 'Trọng tài';

    if (organizerReceiverId) {
      try {
        await this.notificationsService.sendNotification(
          action === 'ACCEPT'
            ? buildRefereeInviteAcceptedNotification({
                tournamentId,
                tournamentName: tournament.name,
                receiverId: organizerReceiverId,
                refereeName,
              })
            : buildRefereeInviteDeclinedNotification({
                tournamentId,
                tournamentName: tournament.name,
                receiverId: organizerReceiverId,
                refereeName,
              }),
        );
      } catch (error) {
        console.error('Failed to send referee response notification:', error);
      }
    }

    return updatedReferee;
  }

  async revokeRefereeInvite(
    tournamentId: string,
    refereeId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const [tournament, referee] = await Promise.all([
      this.tournamentsRepository.findById(tournamentId),
      this.tournamentsRepository.findRefereeById(refereeId),
    ]);

    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    if (!referee || referee.tournamentId !== tournamentId) {
      throw new NotFoundException('Không tìm thấy lời mời trọng tài');
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);

    if (!isAuthorized) {
      throw new ForbiddenException(
        'Bạn không có quyền thu hồi lời mời trọng tài của giải đấu này',
      );
    }

    if (referee.status !== 'INVITED') {
      throw new BadRequestException(
        'Chỉ có thể thu hồi lời mời đang chờ phản hồi.',
      );
    }

    const removedInvite =
      await this.tournamentsRepository.removeRefereeInvite(refereeId);

    await this.notificationsService.deleteByReceiverTypeAndRedirect(
      referee.userId,
      'REFEREE_INVITED',
      `/notifications?action=referee-invite&tournamentId=${tournamentId}&refereeId=${refereeId}`,
    );

    try {
      await this.notificationsService.sendNotification(
        buildRefereeInviteRevokedNotification({
          tournamentId,
          tournamentName: tournament.name,
          receiverId: referee.userId,
        }),
      );
    } catch (error) {
      console.error('Failed to send referee revoked notification:', error);
    }

    return removedInvite;
  }
}
