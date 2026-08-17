"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var FootballTeamsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FootballTeamsService = void 0;
const common_1 = require("@nestjs/common");
const football_teams_repository_1 = require("./football-teams.repository");
const notifications_service_1 = require("../notifications/notifications.service");
const notification_builder_1 = require("../notifications/notification-builder");
let FootballTeamsService = FootballTeamsService_1 = class FootballTeamsService {
    repository;
    notificationsService;
    logger = new common_1.Logger(FootballTeamsService_1.name);
    constructor(repository, notificationsService) {
        this.repository = repository;
        this.notificationsService = notificationsService;
    }
    create(userId, dto) {
        if (!dto.name.trim())
            throw new common_1.BadRequestException('Tên đội không được để trống.');
        return this.repository.create(userId, dto);
    }
    listMine(userId) {
        return this.repository.listMine(userId);
    }
    get(teamId) {
        return this.repository.findById(teamId);
    }
    async searchMemberCandidates(userId, teamId, query) {
        await this.assertManager(userId, teamId);
        return this.repository.searchMemberCandidates(teamId, query.q.trim(), query.limit);
    }
    async update(userId, teamId, dto) {
        await this.assertManager(userId, teamId);
        return this.repository.update(teamId, dto);
    }
    async invite(userId, teamId, dto) {
        await this.assertManager(userId, teamId);
        if (dto.userId === userId)
            throw new common_1.BadRequestException('Không thể tự mời chính mình.');
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
    async respond(userId, teamId, status) {
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
    async updateMember(userId, teamId, targetUserId, role) {
        const actor = await this.assertManager(userId, teamId);
        const target = await this.repository.findMember(teamId, targetUserId);
        if (!target || target.status !== 'ACTIVE')
            throw new common_1.BadRequestException('Thành viên không hoạt động.');
        if (actor.role === 'MANAGER' && (target.role === 'CAPTAIN' || role === 'CAPTAIN')) {
            throw new common_1.ForbiddenException('Quản lý không được thay đổi quyền đội trưởng.');
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
    async cancelInvite(userId, teamId, targetUserId) {
        await this.assertManager(userId, teamId);
        const team = await this.repository.findById(teamId);
        const member = await this.repository.cancelInvite(teamId, targetUserId);
        await this.notify({
            teamId,
            teamName: team.name,
            receiverId: targetUserId,
            senderId: userId,
            type: 'FOOTBALL_TEAM_INVITE_CANCELLED',
        });
        return member;
    }
    async removeMember(userId, teamId, targetUserId) {
        if (userId === targetUserId) {
            throw new common_1.BadRequestException('Hãy dùng chức năng rời đội để tự rời đội.');
        }
        const actor = await this.assertManager(userId, teamId);
        const target = await this.repository.findMember(teamId, targetUserId);
        if (!target || target.status !== 'ACTIVE')
            throw new common_1.BadRequestException('Thành viên không hoạt động.');
        if (actor.role === 'MANAGER' && target.role === 'CAPTAIN') {
            throw new common_1.ForbiddenException('Quản lý không được xóa đội trưởng.');
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
    async leave(userId, teamId) {
        const team = await this.repository.findById(teamId);
        const member = await this.repository.leave(teamId, userId);
        const managers = team.members.filter((candidate) => candidate.status === 'ACTIVE' &&
            ['CAPTAIN', 'MANAGER'].includes(candidate.role) &&
            candidate.userId !== userId);
        await Promise.all(managers.map((manager) => this.notify({
            teamId,
            teamName: team.name,
            receiverId: manager.userId,
            senderId: userId,
            type: 'FOOTBALL_TEAM_MEMBER_LEFT',
        })));
        return member;
    }
    async assertManager(userId, teamId) {
        const member = await this.repository.findMember(teamId, userId);
        if (!member || member.status !== 'ACTIVE' || !['CAPTAIN', 'MANAGER'].includes(member.role)) {
            throw new common_1.ForbiddenException('Bạn không có quyền quản lý đội bóng này.');
        }
        return member;
    }
    async notify(params) {
        try {
            await this.notificationsService.sendNotification((0, notification_builder_1.buildFootballTeamNotification)(params));
        }
        catch (error) {
            this.logger.warn(`Không gửi được thông báo đội bóng ${params.type}: ${String(error)}`);
        }
    }
};
exports.FootballTeamsService = FootballTeamsService;
exports.FootballTeamsService = FootballTeamsService = FootballTeamsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [football_teams_repository_1.FootballTeamsRepository,
        notifications_service_1.NotificationsService])
], FootballTeamsService);
//# sourceMappingURL=football-teams.service.js.map