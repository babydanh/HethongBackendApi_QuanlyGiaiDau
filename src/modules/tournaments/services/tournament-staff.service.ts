import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { buildStaffAddedNotification } from '../../notifications/notification-builder';

@Injectable()
export class TournamentStaffService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly notificationsService: NotificationsService,
  ) {}
  async findStaffByTournament(id: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    return this.tournamentsRepository.findStaffByTournament(id);
  }

  async addStaffMember(
    id: string,
    email: string,
    role: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized)
      throw new ForbiddenException(
        'Bạn không có quyền thêm thành viên ban tổ chức',
      );
    const userToInvite =
      await this.tournamentsRepository.findUserByEmail(email);
    if (!userToInvite) {
      throw new NotFoundException(
        `Email "${email}" chưa đăng ký tài khoản trên hệ thống. Người được mời cần có tài khoản trước khi trở thành ${role === 'REFEREE' ? 'trọng tài' : role === 'SPECTATOR' ? 'khách xem' : 'ban tổ chức'}.`,
      );
    }
    const record = await this.tournamentsRepository.addStaffMember(
      id,
      userToInvite.id,
      role,
      userId,
    );

    const roleLabel =
      role === 'REFEREE'
        ? 'trọng tài'
        : role === 'SPECTATOR'
          ? 'khách xem'
          : 'đồng tổ chức';
    try {
      await this.notificationsService.sendNotification(
        buildStaffAddedNotification({
          tournamentId: id,
          tournamentName: tournament.name,
          receiverId: userToInvite.id,
          roleLabel,
        }),
      );
    } catch (error) {
      console.error('Failed to send staff-add notification:', error);
    }

    return record;
  }

  async removeStaffMember(
    id: string,
    staffUserId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized)
      throw new ForbiddenException(
        'Bạn không có quyền xóa thành viên ban tổ chức',
      );
    return this.tournamentsRepository.removeStaffMember(id, staffUserId);
  }
}
