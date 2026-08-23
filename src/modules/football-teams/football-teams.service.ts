import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { FootballTeamsRepository } from './football-teams.repository';
import { CreateFootballTeamDto } from './dto/create-football-team.dto';
import { UpdateFootballTeamDto } from './dto/update-football-team.dto';
import { InviteFootballTeamMemberDto } from './dto/invite-football-team-member.dto';
import { QueryFootballTeamMemberCandidatesDto } from './dto/query-football-team-member-candidates.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { buildFootballTeamNotification, getFootballTeamRedirect } from '../notifications/notification-builder';

type TeamRole = 'CAPTAIN' | 'MANAGER' | 'PLAYER';

@Injectable()
export class FootballTeamsService {
  private readonly logger = new Logger(FootballTeamsService.name);

  constructor(
    private readonly repository: FootballTeamsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  create(userId: string, dto: CreateFootballTeamDto) {
    if (!dto.name.trim()) throw new BadRequestException('Tên đội không được để trống.');
    return this.repository.create(userId, dto);
  }

  listMine(userId: string) {
    return this.repository.listMine(userId);
  }

  async get(userId: string, teamId: string) {
    const member = await this.repository.findMember(teamId, userId);
    if (!member || member.status !== 'ACTIVE') {
      throw new ForbiddenException('Bạn không có quyền xem chi tiết đội bóng này.');
    }
    return this.repository.findById(teamId);
  }

  async searchMemberCandidates(
    userId: string,
    teamId: string,
    query: QueryFootballTeamMemberCandidatesDto,
  ) {
    await this.assertManager(userId, teamId);
    return this.repository.searchMemberCandidates(teamId, query.q.trim(), query.limit);
  }

  async update(userId: string, teamId: string, dto: UpdateFootballTeamDto) {
    await this.assertManager(userId, teamId);
    return this.repository.update(teamId, dto);
  }

  async invite(userId: string, teamId: string, dto: InviteFootballTeamMemberDto) {
    await this.assertManager(userId, teamId);
    if (dto.userId === userId) throw new BadRequestException('Không thể tự mời chính mình.');
    const team = await this.repository.findById(teamId);
    const member = await this.repository.invite(teamId, userId, dto.userId, dto.role ?? 'PLAYER');
    await this.notify({
      teamId,
      teamName: team.name,
      receiverId: dto.userId,
      senderId: userId,
      type: 'FOOTBALL_TEAM_INVITED',
    });
    return member;
  }

  async respond(userId: string, teamId: string, status: 'ACCEPTED' | 'DECLINED') {
    const team = await this.repository.findById(teamId);
    const member = await this.repository.respond(teamId, userId, status);
    if (member.invitedBy) {
      await this.notify({
        teamId,
        teamName: team.name,
        receiverId: member.invitedBy,
        senderId: userId,
        type: status === 'ACCEPTED' ? 'FOOTBALL_TEAM_INVITE_ACCEPTED' : 'FOOTBALL_TEAM_INVITE_DECLINED',
      });
    }
    return member;
  }

  async updateMember(userId: string, teamId: string, targetUserId: string, role: TeamRole) {
    const actor = await this.assertManager(userId, teamId);
    const target = await this.repository.findMember(teamId, targetUserId);
    if (!target || target.status !== 'ACTIVE') throw new BadRequestException('Thành viên không hoạt động.');
    if (actor.role === 'MANAGER' && (target.role === 'CAPTAIN' || role === 'CAPTAIN')) {
      throw new ForbiddenException('Quản lý không được thay đổi quyền đội trưởng.');
    }
    const member = await this.repository.updateMember(teamId, targetUserId, role, userId);
    const team = await this.repository.findById(teamId);
    await this.notify({
      teamId,
      teamName: team.name,
      receiverId: targetUserId,
      senderId: userId,
      type: 'FOOTBALL_TEAM_ROLE_CHANGED',
    });
    return member;
  }

  async cancelInvite(userId: string, teamId: string, targetUserId: string) {
    await this.assertManager(userId, teamId);
    const team = await this.repository.findById(teamId);
    const member = await this.repository.cancelInvite(teamId, targetUserId);
    // Xóa thông báo mời cũ để không còn nút nhận lời mời đã bị hủy;
    // nếu sau này mời lại, chỉ thông báo mới được phép thao tác.
    try {
      await this.notificationsService.deleteByReceiverTypeAndRedirect(
        targetUserId,
        'FOOTBALL_TEAM_INVITED',
        getFootballTeamRedirect(teamId),
      );
    } catch (error) {
      this.logger.warn(`Không dọn được thông báo mời đội bóng đã hủy: ${String(error)}`);
    }
    await this.notify({
      teamId,
      teamName: team.name,
      receiverId: targetUserId,
      senderId: userId,
      type: 'FOOTBALL_TEAM_INVITE_CANCELLED',
    });
    return member;
  }

  async removeMember(userId: string, teamId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('Hãy dùng chức năng rời đội để tự rời đội.');
    }
    const actor = await this.assertManager(userId, teamId);
    const target = await this.repository.findMember(teamId, targetUserId);
    if (!target || target.status !== 'ACTIVE') throw new BadRequestException('Thành viên không hoạt động.');
    if (actor.role === 'MANAGER' && target.role === 'CAPTAIN') {
      throw new ForbiddenException('Quản lý không được xóa đội trưởng.');
    }
    const team = await this.repository.findById(teamId);
    const member = await this.repository.removeMember(teamId, targetUserId, userId);
    await this.notify({
      teamId,
      teamName: team.name,
      receiverId: targetUserId,
      senderId: userId,
      type: 'FOOTBALL_TEAM_MEMBER_REMOVED',
    });
    return member;
  }

  async leave(userId: string, teamId: string) {
    const team = await this.repository.findById(teamId);
    const member = await this.repository.leave(teamId, userId);
    const managers = team.members.filter(
      (candidate) =>
        candidate.status === 'ACTIVE' &&
        ['CAPTAIN', 'MANAGER'].includes(candidate.role) &&
        candidate.userId !== userId,
    );
    await Promise.all(
      managers.map((manager) =>
        this.notify({
          teamId,
          teamName: team.name,
          receiverId: manager.userId,
          senderId: userId,
          type: 'FOOTBALL_TEAM_MEMBER_LEFT',
        }),
      ),
    );
    return member;
  }

  private async assertManager(userId: string, teamId: string) {
    const member = await this.repository.findMember(teamId, userId);
    if (!member || member.status !== 'ACTIVE' || !['CAPTAIN', 'MANAGER'].includes(member.role)) {
      throw new ForbiddenException('Bạn không có quyền quản lý đội bóng này.');
    }
    return member;
  }

  private async notify(params: Parameters<typeof buildFootballTeamNotification>[0]) {
    try {
      await this.notificationsService.sendNotification(buildFootballTeamNotification(params));
    } catch (error) {
      this.logger.warn(`Không gửi được thông báo đội bóng ${params.type}: ${String(error)}`);
    }
  }
}
