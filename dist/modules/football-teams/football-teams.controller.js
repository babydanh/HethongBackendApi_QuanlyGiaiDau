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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FootballTeamsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const create_football_team_dto_1 = require("./dto/create-football-team.dto");
const invite_football_team_member_dto_1 = require("./dto/invite-football-team-member.dto");
const respond_football_team_invite_dto_1 = require("./dto/respond-football-team-invite.dto");
const update_football_team_dto_1 = require("./dto/update-football-team.dto");
const update_football_team_member_dto_1 = require("./dto/update-football-team-member.dto");
const football_teams_service_1 = require("./football-teams.service");
const query_football_team_member_candidates_dto_1 = require("./dto/query-football-team-member-candidates.dto");
let FootballTeamsController = class FootballTeamsController {
    service;
    constructor(service) {
        this.service = service;
    }
    create(user, dto) {
        return this.service.create(user.sub, dto);
    }
    listMine(user) {
        return this.service.listMine(user.sub);
    }
    get(id) {
        return this.service.get(id);
    }
    update(user, id, dto) {
        return this.service.update(user.sub, id, dto);
    }
    searchMemberCandidates(user, id, query) {
        return this.service.searchMemberCandidates(user.sub, id, query);
    }
    invite(user, id, dto) {
        return this.service.invite(user.sub, id, dto);
    }
    respond(user, id, dto) {
        return this.service.respond(user.sub, id, dto.status);
    }
    cancelInvite(user, id, targetUserId) {
        return this.service.cancelInvite(user.sub, id, targetUserId);
    }
    updateMember(user, id, targetUserId, dto) {
        return this.service.updateMember(user.sub, id, targetUserId, dto.role);
    }
    leave(user, id) {
        return this.service.leave(user.sub, id);
    }
    removeMember(user, id, targetUserId) {
        return this.service.removeMember(user.sub, id, targetUserId);
    }
};
exports.FootballTeamsController = FootballTeamsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo đội bóng' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_football_team_dto_1.CreateFootballTeamDto]),
    __metadata("design:returntype", void 0)
], FootballTeamsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, swagger_1.ApiOperation)({ summary: 'Danh sách đội bóng của tôi' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], FootballTeamsController.prototype, "listMine", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], FootballTeamsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_football_team_dto_1.UpdateFootballTeamDto]),
    __metadata("design:returntype", void 0)
], FootballTeamsController.prototype, "update", null);
__decorate([
    (0, common_1.Get)(':id/member-candidates'),
    (0, swagger_1.ApiOperation)({ summary: 'Tìm tài khoản đủ điều kiện để mời vào đội' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, query_football_team_member_candidates_dto_1.QueryFootballTeamMemberCandidatesDto]),
    __metadata("design:returntype", void 0)
], FootballTeamsController.prototype, "searchMemberCandidates", null);
__decorate([
    (0, common_1.Post)(':id/invites'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, invite_football_team_member_dto_1.InviteFootballTeamMemberDto]),
    __metadata("design:returntype", void 0)
], FootballTeamsController.prototype, "invite", null);
__decorate([
    (0, common_1.Post)(':id/invites/respond'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, respond_football_team_invite_dto_1.RespondFootballTeamInviteDto]),
    __metadata("design:returntype", void 0)
], FootballTeamsController.prototype, "respond", null);
__decorate([
    (0, common_1.Delete)(':id/invites/:userId'),
    (0, swagger_1.ApiOperation)({ summary: 'Hủy lời mời đang chờ' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], FootballTeamsController.prototype, "cancelInvite", null);
__decorate([
    (0, common_1.Patch)(':id/members/:userId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, update_football_team_member_dto_1.UpdateFootballTeamMemberDto]),
    __metadata("design:returntype", void 0)
], FootballTeamsController.prototype, "updateMember", null);
__decorate([
    (0, common_1.Delete)(':id/members/me'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], FootballTeamsController.prototype, "leave", null);
__decorate([
    (0, common_1.Delete)(':id/members/:userId'),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa thành viên khỏi đội' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], FootballTeamsController.prototype, "removeMember", null);
exports.FootballTeamsController = FootballTeamsController = __decorate([
    (0, swagger_1.ApiTags)('football-teams'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('football-teams'),
    __metadata("design:paramtypes", [football_teams_service_1.FootballTeamsService])
], FootballTeamsController);
//# sourceMappingURL=football-teams.controller.js.map