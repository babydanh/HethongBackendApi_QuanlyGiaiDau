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
exports.TournamentsController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const tournaments_service_1 = require("./tournaments.service");
const create_tournament_dto_1 = require("./dto/create-tournament.dto");
const create_lite_tournament_dto_1 = require("./dto/create-lite-tournament.dto");
const update_tournament_dto_1 = require("./dto/update-tournament.dto");
const query_tournament_dto_1 = require("./dto/query-tournament.dto");
const register_tournament_dto_1 = require("./dto/register-tournament.dto");
const update_football_roster_dto_1 = require("./dto/update-football-roster.dto");
const pair_lite_participants_dto_1 = require("./dto/pair-lite-participants.dto");
const generate_lite_pairs_dto_1 = require("./dto/generate-lite-pairs.dto");
const update_stage_dto_1 = require("./dto/update-stage.dto");
const update_group_dto_1 = require("./dto/update-group.dto");
const seed_mock_participants_dto_1 = require("./dto/seed-mock-participants.dto");
const import_participants_dto_1 = require("./dto/import-participants.dto");
const gallery_dto_1 = require("./dto/gallery.dto");
const create_parent_tournament_dto_1 = require("./dto/create-parent-tournament.dto");
const update_parent_tournament_dto_1 = require("./dto/update-parent-tournament.dto");
const create_division_dto_1 = require("./dto/create-division.dto");
const update_division_dto_1 = require("./dto/update-division.dto");
const add_referee_dto_1 = require("./dto/add-referee.dto");
const add_staff_member_dto_1 = require("./dto/add-staff-member.dto");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const verified_decorator_1 = require("../../common/decorators/verified.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const jwt_1 = require("@nestjs/jwt");
let TournamentsController = class TournamentsController {
    tournamentsService;
    jwtService;
    constructor(tournamentsService, jwtService) {
        this.tournamentsService = tournamentsService;
        this.jwtService = jwtService;
    }
    getSystemRoles(user) {
        if (Array.isArray(user.roles) && user.roles.length > 0) {
            return user.roles;
        }
        return user.role ? [user.role] : [];
    }
    async getFeesConfig() {
        return this.tournamentsService.getFeesConfig();
    }
    async findPublic(query) {
        return this.tournamentsService.findPublic(query);
    }
    async findMy(user) {
        return this.tournamentsService.findMy(user.sub);
    }
    async findMyWorkspace(user) {
        return this.tournamentsService.getMyWorkspace(user.sub);
    }
    async findByInviteCode(inviteCode) {
        return this.tournamentsService.findByInviteCode(inviteCode);
    }
    async joinByInviteCode(inviteCode, registerTournamentDto, user) {
        return this.tournamentsService.joinByInviteCode(inviteCode, user.sub, registerTournamentDto);
    }
    async findAll(query) {
        return this.tournamentsService.findAll(query);
    }
    async createParent(createParentTournamentDto, user) {
        return this.tournamentsService.createParent(user.sub, createParentTournamentDto, this.getSystemRoles(user));
    }
    async findMyParents(user) {
        return this.tournamentsService.findParentsByUser(user.sub);
    }
    async findOneParent(id) {
        return this.tournamentsService.findParentById(id);
    }
    async getParentAggregation(id) {
        return this.tournamentsService.getParentWithAggregation(id);
    }
    async updateParent(id, updateParentTournamentDto, user) {
        return this.tournamentsService.updateParent(id, user.sub, updateParentTournamentDto, this.getSystemRoles(user));
    }
    async removeParent(id, user) {
        return this.tournamentsService.removeParent(id, user.sub, this.getSystemRoles(user));
    }
    async findDivisions(id) {
        return this.tournamentsService.getDivisionsForTournament(id);
    }
    async createDivision(id, createDivisionDto, user) {
        return this.tournamentsService.createDivision(id, createDivisionDto, user.sub, this.getSystemRoles(user));
    }
    async updateDivision(divisionId, updateDivisionDto, user) {
        return this.tournamentsService.updateDivision(divisionId, updateDivisionDto, user.sub, this.getSystemRoles(user));
    }
    async updateDivisionConfig(id, divisionId, updateDivisionDto, user) {
        return this.tournamentsService.updateDivisionConfig(id, divisionId, updateDivisionDto, user.sub, this.getSystemRoles(user));
    }
    async findDivisionParticipants(id, divisionId) {
        return this.tournamentsService.getParticipantsByDivision(id, divisionId);
    }
    async removeDivision(divisionId, user) {
        return this.tournamentsService.deleteDivision(divisionId, user.sub, this.getSystemRoles(user));
    }
    async findOne(id, inviteCode, participantId, teamInviteToken, req) {
        const authInfo = this.getAuthInfoFromRequest(req);
        return this.tournamentsService.findOne(id, authInfo.userId, inviteCode, authInfo.roles, participantId, teamInviteToken);
    }
    async validateInvite(id, inviteCode) {
        return this.tournamentsService.validateInvite(id, inviteCode);
    }
    getAuthInfoFromRequest(request) {
        if (!request || !request.headers)
            return { userId: null, roles: [] };
        const token = this.extractAccessToken(request);
        if (!token) {
            return { userId: null, roles: [] };
        }
        try {
            const payloadPart = token.split('.')[1];
            if (!payloadPart) {
                return { userId: null, roles: [] };
            }
            const normalizedPayload = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(Buffer.from(normalizedPayload, 'base64').toString('utf8'));
            let roles = [];
            if (Array.isArray(payload.roles)) {
                roles = payload.roles;
            }
            else if (payload.role) {
                roles = [payload.role];
            }
            return { userId: payload.sub || null, roles };
        }
        catch {
            return { userId: null, roles: [] };
        }
    }
    extractAccessToken(request) {
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.split(' ')[1];
        }
        const cookieToken = request.cookies?.accessToken;
        if (typeof cookieToken === 'string' && cookieToken.trim().length > 0) {
            return cookieToken.trim();
        }
        const rawCookieHeader = request.headers.cookie;
        if (typeof rawCookieHeader !== 'string' || rawCookieHeader.trim().length === 0) {
            return null;
        }
        for (const cookieChunk of rawCookieHeader.split(';')) {
            const [rawName, ...valueParts] = cookieChunk.trim().split('=');
            if (rawName !== 'accessToken' || valueParts.length === 0) {
                continue;
            }
            const rawValue = valueParts.join('=').trim();
            if (!rawValue) {
                return null;
            }
            try {
                return decodeURIComponent(rawValue);
            }
            catch {
                return rawValue;
            }
        }
        return null;
    }
    async create(createTournamentDto, user) {
        if (!user?.sub) {
            throw new common_1.UnauthorizedException('Bạn cần đăng nhập để tạo giải đấu.');
        }
        return this.tournamentsService.create(user.sub, createTournamentDto, this.getSystemRoles(user));
    }
    async createLite(dto, user) {
        if (!user?.sub) {
            throw new common_1.UnauthorizedException('Bạn cần đăng nhập để tạo giải đấu.');
        }
        return this.tournamentsService.createLite(user.sub, dto, this.getSystemRoles(user));
    }
    async getLiteJoinStatus(inviteCode, user, req) {
        let userId = user?.sub;
        if (!userId) {
            if (req?.cookies?.accessToken) {
                try {
                    const payload = await this.jwtService.verifyAsync(req.cookies.accessToken);
                    userId = payload.sub;
                }
                catch (_e) { }
            }
            if (!userId && req?.headers?.authorization) {
                const parts = req.headers.authorization.split(' ');
                if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
                    try {
                        const payload = await this.jwtService.verifyAsync(parts[1]);
                        userId = payload.sub;
                    }
                    catch (_e) { }
                }
            }
        }
        return this.tournamentsService.getLiteJoinStatus(inviteCode, userId);
    }
    async joinLite(inviteCode, user) {
        return this.tournamentsService.joinLite(inviteCode, user.sub);
    }
    async getLiteParticipants(id, user) {
        return this.tournamentsService.getLiteParticipants(id, user.sub, this.getSystemRoles(user));
    }
    async pairLiteParticipants(id, dto, user) {
        return this.tournamentsService.pairLiteParticipants(id, user.sub, this.getSystemRoles(user), dto);
    }
    async generateLitePairs(id, dto, user) {
        return this.tournamentsService.generateLitePairs(id, user.sub, this.getSystemRoles(user), dto);
    }
    async unpairLiteParticipant(id, participantId, user) {
        return this.tournamentsService.unpairLiteParticipant(id, participantId, user.sub, this.getSystemRoles(user));
    }
    async generateLiteBracket(id, user) {
        return this.tournamentsService.generateLiteBracket(id, user.sub, this.getSystemRoles(user));
    }
    async resetLiteBracket(id, user) {
        return this.tournamentsService.generateLiteBracket(id, user.sub, this.getSystemRoles(user), true);
    }
    async update(id, updateTournamentDto, user) {
        return this.tournamentsService.update(id, user.sub, updateTournamentDto, this.getSystemRoles(user));
    }
    async remove(id, user) {
        return this.tournamentsService.remove(id, user.sub, this.getSystemRoles(user));
    }
    async generateBracket(id, divisionId, seedingType, allowReset, user) {
        return this.tournamentsService.generateBracket(id, user.sub, this.getSystemRoles(user), divisionId, seedingType, allowReset ?? true);
    }
    async publish(id, user) {
        return this.tournamentsService.publish(id, user.sub, this.getSystemRoles(user));
    }
    async follow(id, user) {
        return this.tournamentsService.followTournament(id, user.sub);
    }
    async unfollow(id, user) {
        return this.tournamentsService.unfollowTournament(id, user.sub);
    }
    async getFollowed(user) {
        return this.tournamentsService.getFollowedTournaments(user.sub);
    }
    async updateSeeds(id, seeds, user) {
        return this.tournamentsService.updateSeeds(id, seeds, user.sub, this.getSystemRoles(user));
    }
    async lock(id, user) {
        return this.tournamentsService.lock(id, user.sub, this.getSystemRoles(user));
    }
    async confirmRoster(id, user) {
        return this.tournamentsService.confirmRoster(id, user.sub, this.getSystemRoles(user));
    }
    async register(id, registerTournamentDto, user, inviteCode) {
        return this.tournamentsService.register(id, user.sub, registerTournamentDto, inviteCode);
    }
    async joinTeam(id, participantId, teamInviteToken, user) {
        return this.tournamentsService.joinTeam(id, user.sub, participantId, teamInviteToken);
    }
    async acceptPartnerInvite(participantId, user) {
        return this.tournamentsService.acceptPartnerInvite(participantId, user.sub);
    }
    async rejectPartnerInvite(participantId, user) {
        return this.tournamentsService.rejectPartnerInvite(participantId, user.sub);
    }
    async withdraw(id, user, bankData) {
        return this.tournamentsService.withdraw(id, user.sub, bankData, bankData?.tournamentDivisionId);
    }
    async myRegistration(id, user, divisionId) {
        return this.tournamentsService.myRegistration(id, user.sub, divisionId);
    }
    async regenerateInvite(id, user) {
        return this.tournamentsService.regenerateInviteCode(id, user.sub, this.getSystemRoles(user));
    }
    async getGallery(id) {
        return this.tournamentsService.getGallery(id);
    }
    async addGalleryImage(id, uploadGalleryDto, user) {
        return this.tournamentsService.addGalleryImage(id, user.sub, uploadGalleryDto.url, this.getSystemRoles(user));
    }
    async removeGalleryImage(id, index, user) {
        return this.tournamentsService.removeGalleryImage(id, user.sub, index, this.getSystemRoles(user));
    }
    async findParticipants(id, divisionId) {
        return this.tournamentsService.findParticipants(id, divisionId);
    }
    async findParticipantsForOrganizer(id, divisionId, user) {
        return this.tournamentsService.findParticipantsForOrganizer(id, divisionId, user.sub, this.getSystemRoles(user));
    }
    async findReferees(id, user) {
        return this.tournamentsService.findReferees(id, user.sub, this.getSystemRoles(user));
    }
    async addReferee(id, body, user) {
        return this.tournamentsService.addReferee(id, body.email, user.sub, this.getSystemRoles(user));
    }
    async respondToRefereeInvite(tournamentId, refereeId, action, user) {
        return this.tournamentsService.respondToRefereeInvite(tournamentId, refereeId, user.sub, action);
    }
    async revokeRefereeInvite(tournamentId, refereeId, user) {
        return this.tournamentsService.revokeRefereeInvite(tournamentId, refereeId, user.sub, this.getSystemRoles(user));
    }
    async findBracket(id, divisionId) {
        return this.tournamentsService.findBracket(id, divisionId);
    }
    async updateStage(id, updateStageDto, user) {
        return this.tournamentsService.updateStage(id, user.sub, updateStageDto, this.getSystemRoles(user));
    }
    async updateGroup(id, updateGroupDto, user) {
        return this.tournamentsService.updateGroup(id, user.sub, updateGroupDto, this.getSystemRoles(user));
    }
    async seedMockParticipants(id, dto, user) {
        return this.tournamentsService.seedMockParticipants(id, user.sub, dto.names, this.getSystemRoles(user), dto.divisionId);
    }
    async importParticipants(id, dto, user) {
        return this.tournamentsService.importParticipantsFromForm(id, user.sub, this.getSystemRoles(user), dto);
    }
    async clearMockParticipants(id, divisionId, user) {
        return this.tournamentsService.clearMockParticipants(id, user.sub, this.getSystemRoles(user), divisionId);
    }
    async deleteMockParticipant(id, participantId, user) {
        return this.tournamentsService.deleteMockParticipant(id, participantId, user.sub, this.getSystemRoles(user));
    }
    async updateParticipantStatus(id, participantId, status, user) {
        return this.tournamentsService.updateParticipantStatus(id, participantId, status, user.sub, this.getSystemRoles(user));
    }
    async lockParticipantRoster(id, participantId, user) {
        return this.tournamentsService.lockParticipantRoster(id, participantId, user.sub, this.getSystemRoles(user));
    }
    async unlockParticipantRoster(id, participantId, user) {
        return this.tournamentsService.unlockParticipantRoster(id, participantId, user.sub, this.getSystemRoles(user));
    }
    async getFootballRosterStatus(id, participantId, user) {
        return this.tournamentsService.getFootballRosterStatus(id, participantId, user.sub, this.getSystemRoles(user));
    }
    async respondFootballRoster(id, participantId, action, user) {
        return this.tournamentsService.respondFootballRoster(id, participantId, user.sub, action);
    }
    async updateFootballRoster(id, participantId, dto, user) {
        return this.tournamentsService.updateFootballRoster(id, participantId, dto, user.sub, this.getSystemRoles(user));
    }
    async assignReservedSlot(id, userEmailOrPhone, teamName, partnerEmailOrPhone, divisionId, user) {
        return this.tournamentsService.assignReservedSlot(id, userEmailOrPhone, teamName, user.sub, this.getSystemRoles(user), partnerEmailOrPhone, divisionId);
    }
    async kickParticipant(id, participantId, reason, user) {
        return this.tournamentsService.kickParticipant(id, participantId, user.sub, reason, this.getSystemRoles(user));
    }
    async getOpsAuditLogs(id, divisionId, user) {
        return this.tournamentsService.getOpsAuditLogs(id, user.sub, this.getSystemRoles(user), divisionId);
    }
    async cancelTournament(id, user) {
        return this.tournamentsService.cancelTournament(id, user.sub, this.getSystemRoles(user));
    }
    async createPlayoffMatch(id, stageId, participant1Id, participant2Id, user) {
        return this.tournamentsService.createPlayoffMatch(id, { stageId, participant1Id, participant2Id }, user.sub, this.getSystemRoles(user));
    }
    async finalizeStage(id, stageId, user) {
        return this.tournamentsService.finalizeStage(id, stageId, user.sub, this.getSystemRoles(user));
    }
    async autoSeed(id, divisionId, user) {
        return this.tournamentsService.autoSeedFromElo(id, user.sub, this.getSystemRoles(user), divisionId);
    }
    async advanceStandings(id, divisionId, stageId, user) {
        return this.tournamentsService.advanceStandings(id, divisionId, stageId, user.sub, this.getSystemRoles(user));
    }
    async getGroupStandings(id, divisionId) {
        return this.tournamentsService.getGroupStandings(id, divisionId);
    }
    async getTournamentResults(id, divisionId) {
        return this.tournamentsService.getTournamentResultsV2(id, divisionId);
    }
    async findStaff(id) {
        return this.tournamentsService.findStaffByTournament(id);
    }
    async addStaffMember(id, body, user) {
        return this.tournamentsService.addStaffMember(id, body.email, body.role, user.sub, this.getSystemRoles(user));
    }
    async removeStaffMember(id, staffUserId, user) {
        return this.tournamentsService.removeStaffMember(id, staffUserId, user.sub, this.getSystemRoles(user));
    }
};
exports.TournamentsController = TournamentsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('fees'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy cấu hình các loại phí giải đấu và phí hoa hồng' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "getFeesConfig", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('public'),
    (0, swagger_1.ApiOperation)({ summary: 'Chỉ lấy danh sách giải đấu PUBLIC công khai' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_tournament_dto_1.QueryTournamentDto]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findPublic", null);
__decorate([
    (0, common_1.Get)('my'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách giải đấu người dùng tạo hoặc tham gia' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findMy", null);
__decorate([
    (0, common_1.Get)('workspace/me'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy workspace người dùng theo vai trò: tham gia, tổ chức, trọng tài' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findMyWorkspace", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('join/:inviteCode'),
    (0, swagger_1.ApiOperation)({ summary: 'Xem thông tin giải đấu qua mã mời' }),
    __param(0, (0, common_1.Param)('inviteCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findByInviteCode", null);
__decorate([
    (0, common_1.Post)('join/:inviteCode'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tham gia giải đấu qua mã mời' }),
    __param(0, (0, common_1.Param)('inviteCode')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, register_tournament_dto_1.RegisterTournamentDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "joinByInviteCode", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách giải đấu' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_tournament_dto_1.QueryTournamentDto]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)('parent'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo giải đấu cha (chuỗi giải đấu / nhiều thể loại)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_parent_tournament_dto_1.CreateParentTournamentDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "createParent", null);
__decorate([
    (0, common_1.Get)('parent/my'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách giải đấu cha của tôi' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findMyParents", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('parent/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy chi tiết giải đấu cha kèm danh sách các thể loại/phân hạng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findOneParent", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('parent/:id/aggregation'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy thống kê tổng hợp của giải đấu cha' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "getParentAggregation", null);
__decorate([
    (0, common_1.Patch)('parent/:id'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật thông tin giải đấu cha' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_parent_tournament_dto_1.UpdateParentTournamentDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "updateParent", null);
__decorate([
    (0, common_1.Delete)('parent/:id'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa giải đấu cha' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "removeParent", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/divisions'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách bảng/nội dung thi đấu của giải' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findDivisions", null);
__decorate([
    (0, common_1.Post)(':id/divisions'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo bảng/nội dung thi đấu cho giải' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_division_dto_1.CreateDivisionDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "createDivision", null);
__decorate([
    (0, common_1.Patch)('divisions/:divisionId'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật bảng/nội dung thi đấu' }),
    __param(0, (0, common_1.Param)('divisionId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_division_dto_1.UpdateDivisionDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "updateDivision", null);
__decorate([
    (0, common_1.Patch)(':id/divisions/:divisionId/config'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Bật/tắt và cập nhật cấu hình riêng của hình thức thi đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('divisionId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_division_dto_1.UpdateDivisionDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "updateDivisionConfig", null);
__decorate([
    (0, common_1.Get)(':id/divisions/:divisionId/participants'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách người chơi theo hình thức thi đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('divisionId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findDivisionParticipants", null);
__decorate([
    (0, common_1.Delete)('divisions/:divisionId'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa bảng/nội dung thi đấu' }),
    __param(0, (0, common_1.Param)('divisionId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "removeDivision", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 1800, ttl: 60000 } }),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy chi tiết giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('invite')),
    __param(2, (0, common_1.Query)('pid')),
    __param(3, (0, common_1.Query)('token')),
    __param(4, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findOne", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)(':id/validate-invite'),
    (0, swagger_1.ApiOperation)({ summary: 'Kiểm tra mã mời giải đấu PRIVATE' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)('inviteCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "validateInvite", null);
__decorate([
    (0, common_1.Post)(),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo giải đấu mới (hỗ trợ cả Web và App)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_tournament_dto_1.CreateTournamentDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('lite'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo giải đấu nhanh trong CLB (Lite) — chỉ cần sport slug, không cần categoryId UUID' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_lite_tournament_dto_1.CreateLiteTournamentDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "createLite", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('lite/join/:inviteCode'),
    (0, swagger_1.ApiOperation)({ summary: 'Kiểm tra trạng thái tham gia Lite tournament' }),
    __param(0, (0, common_1.Param)('inviteCode')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "getLiteJoinStatus", null);
__decorate([
    (0, common_1.Post)('lite/join/:inviteCode'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tham gia Lite tournament 1 chạm' }),
    __param(0, (0, common_1.Param)('inviteCode')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "joinLite", null);
__decorate([
    (0, common_1.Get)('lite/:id/participants'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách participants cho ghép cặp Lite' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "getLiteParticipants", null);
__decorate([
    (0, common_1.Post)('lite/:id/pairs'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Ghép cặp 2 participant thủ công (Lite doubles)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, pair_lite_participants_dto_1.PairLiteParticipantsDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "pairLiteParticipants", null);
__decorate([
    (0, common_1.Post)('lite/:id/pairs/generate'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tự động ghép cặp (RANDOM hoặc ELO_BALANCED) cho Lite doubles' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, generate_lite_pairs_dto_1.GenerateLitePairsDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "generateLitePairs", null);
__decorate([
    (0, common_1.Post)('lite/:id/pairs/:participantId/unpair'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tách cặp participant đã ghép (Lite doubles)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('participantId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "unpairLiteParticipant", null);
__decorate([
    (0, common_1.Post)('lite/:id/bracket'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo hoặc lưu bracket cho giải Lite' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "generateLiteBracket", null);
__decorate([
    (0, common_1.Post)('lite/:id/bracket/reset'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Reset bracket Lite trước khi có trận bắt đầu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "resetLiteBracket", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_tournament_dto_1.UpdateTournamentDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa giải đấu (Soft Delete)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/generate-bracket'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Sinh nhánh đấu tự động (Bracket Generation)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)('divisionId')),
    __param(2, (0, common_1.Body)('seedingType')),
    __param(3, (0, common_1.Body)('allowReset')),
    __param(4, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "generateBracket", null);
__decorate([
    (0, common_1.Post)(':id/publish'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Công bố giải đấu từ DRAFT -> REGISTRATION_OPEN' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)(':id/follow'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Theo dõi giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "follow", null);
__decorate([
    (0, common_1.Delete)(':id/follow'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Bỏ theo dõi giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "unfollow", null);
__decorate([
    (0, common_1.Get)('my/followed'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Danh sách giải đấu đang theo dõi' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "getFollowed", null);
__decorate([
    (0, common_1.Patch)(':id/seeds'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật hạt giống hàng loạt cho các đội/VĐV' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)('seeds')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Array, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "updateSeeds", null);
__decorate([
    (0, common_1.Post)(':id/lock'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Chốt danh sách VĐV, tính phí sàn và sinh bracket' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "lock", null);
__decorate([
    (0, common_1.Post)(':id/confirm-roster'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Chốt danh sách hiện tại, không tự tạo bracket' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "confirmRoster", null);
__decorate([
    (0, common_1.Post)(':id/register'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, throttler_1.Throttle)({ sensitive: { limit: 5, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({ summary: 'Đăng ký tham gia giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Query)('invite')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, register_tournament_dto_1.RegisterTournamentDto, Object, String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "register", null);
__decorate([
    (0, common_1.Post)(':id/join-team'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, throttler_1.Throttle)({ sensitive: { limit: 5, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({ summary: 'Đồng đội tham gia nhóm thi đấu đánh đôi' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)('participantId')),
    __param(2, (0, common_1.Body)('teamInviteToken')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "joinTeam", null);
__decorate([
    (0, common_1.Post)('participants/:participantId/accept-partner'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Chấp nhận lời mời ghép đôi (tối đa 1 giờ hoặc đến hạn đóng đăng ký)' }),
    __param(0, (0, common_1.Param)('participantId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "acceptPartnerInvite", null);
__decorate([
    (0, common_1.Post)('participants/:participantId/reject-partner'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Từ chối lời mời ghép đôi' }),
    __param(0, (0, common_1.Param)('participantId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "rejectPartnerInvite", null);
__decorate([
    (0, common_1.Post)(':id/withdraw'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Rút lui khỏi giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "withdraw", null);
__decorate([
    (0, common_1.Get)(':id/my-registration'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Kiểm tra trạng thái đăng ký của bản thân trong giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('divisionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "myRegistration", null);
__decorate([
    (0, common_1.Post)(':id/regenerate-invite'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo lại mã mời mới' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "regenerateInvite", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/gallery'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách ảnh gallery của giải đấu (PUBLIC)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "getGallery", null);
__decorate([
    (0, common_1.Post)(':id/gallery'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Thêm ảnh mới vào gallery' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, gallery_dto_1.UploadGalleryDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "addGalleryImage", null);
__decorate([
    (0, common_1.Delete)(':id/gallery/:index'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa ảnh khỏi gallery theo index' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('index', common_1.ParseIntPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "removeGalleryImage", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/participants'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách VĐV đăng ký tham gia kèm rosters' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('divisionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findParticipants", null);
__decorate([
    (0, common_1.Get)(':id/manage/participants'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách participant đầy đủ cho BTC' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('divisionId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findParticipantsForOrganizer", null);
__decorate([
    (0, common_1.Get)(':id/referees'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách trọng tài của giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findReferees", null);
__decorate([
    (0, common_1.Post)(':id/referees'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Mời trọng tài tham gia giải đấu bằng Email/Gmail' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, add_referee_dto_1.AddRefereeDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "addReferee", null);
__decorate([
    (0, common_1.Patch)(':id/referees/:refereeId/respond'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Trọng tài chấp nhận/từ chối lời mời làm trọng tài' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Phản hồi lời mời thành công' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('refereeId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)('action')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "respondToRefereeInvite", null);
__decorate([
    (0, common_1.Delete)(':id/referees/:refereeId'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'BTC thu hồi lời mời trọng tài đang chờ phản hồi' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('refereeId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "revokeRefereeInvite", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: 1800, ttl: 60000 } }),
    (0, common_1.Get)(':id/bracket'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy full bracket data' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('divisionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findBracket", null);
__decorate([
    (0, common_1.Patch)('stages/:id'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật cấu hình vòng đấu (Stage)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_stage_dto_1.UpdateStageDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "updateStage", null);
__decorate([
    (0, common_1.Patch)('groups/:id'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật cấu hình luật cho một bảng đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_group_dto_1.UpdateGroupDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "updateGroup", null);
__decorate([
    (0, common_1.Post)(':id/mock-participants'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Sinh danh sách VĐV giả lập để test' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, seed_mock_participants_dto_1.SeedMockParticipantsDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "seedMockParticipants", null);
__decorate([
    (0, common_1.Post)(':id/import-participants'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Nhập danh sách VĐV từ Google Form / Excel' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, import_participants_dto_1.ImportParticipantsDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "importParticipants", null);
__decorate([
    (0, common_1.Delete)(':id/mock-participants'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa toàn bộ VĐV giả lập' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('divisionId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "clearMockParticipants", null);
__decorate([
    (0, common_1.Delete)(':id/participants/:participantId/mock'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa một participant giả lập' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('participantId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "deleteMockParticipant", null);
__decorate([
    (0, common_1.Patch)(':id/participants/:participantId'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Duyệt hoặc từ chối vận động viên đăng ký' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('participantId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)('status')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "updateParticipantStatus", null);
__decorate([
    (0, common_1.Post)(':id/participants/:participantId/lock-roster'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Khóa roster đội trước khi lập sơ đồ thi đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('participantId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "lockParticipantRoster", null);
__decorate([
    (0, common_1.Post)(':id/participants/:participantId/unlock-roster'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Mở khóa roster đội trước khi giải bắt đầu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('participantId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "unlockParticipantRoster", null);
__decorate([
    (0, common_1.Get)(':id/participants/:participantId/football-roster'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy trạng thái xác nhận roster đội bóng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('participantId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "getFootballRosterStatus", null);
__decorate([
    (0, common_1.Post)(':id/participants/:participantId/football-roster/respond'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xác nhận hoặc từ chối roster đội bóng trong giải' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('participantId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)('action')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "respondFootballRoster", null);
__decorate([
    (0, common_1.Patch)(':id/participants/:participantId/football-roster'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật đội hình đăng ký bóng đá trước khi khóa roster' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('participantId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_football_roster_dto_1.UpdateFootballRosterDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "updateFootballRoster", null);
__decorate([
    (0, common_1.Post)(':id/reserve-slots'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Gán trực tiếp người chơi vào slot giữ chỗ (Wildcard)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)('userEmailOrPhone')),
    __param(2, (0, common_1.Body)('teamName')),
    __param(3, (0, common_1.Body)('partnerEmailOrPhone')),
    __param(4, (0, common_1.Body)('divisionId')),
    __param(5, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "assignReservedSlot", null);
__decorate([
    (0, common_1.Post)(':id/participants/:participantId/kick'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Kick vận động viên/đội thi đấu khỏi giải và hoàn tiền' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('participantId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)('reason')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "kickParticipant", null);
__decorate([
    (0, common_1.Get)(':id/ops-audit-logs'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy nhật ký vận hành cho organizer ops panel' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('divisionId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "getOpsAuditLogs", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Hủy giải đấu / nội dung thi đấu và hoàn tiền cho mọi người' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "cancelTournament", null);
__decorate([
    (0, common_1.Post)(':id/playoff'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tao tran Play-off cho Round Robin' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)('stageId')),
    __param(2, (0, common_1.Body)('participant1Id')),
    __param(3, (0, common_1.Body)('participant2Id')),
    __param(4, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "createPlayoffMatch", null);
__decorate([
    (0, common_1.Post)(':id/stages/:stageId/finalize'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Ket thuc som stage (cancel cac tran con lai)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('stageId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "finalizeStage", null);
__decorate([
    (0, common_1.Post)(':id/auto-seed'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tự động xếp hạt giống theo ELO' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)('divisionId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "autoSeed", null);
__decorate([
    (0, common_1.Post)(':id/advance-standings'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Chot vong bang va chuyen tiep sang vong loai truc tiep' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)('divisionId')),
    __param(2, (0, common_1.Body)('stageId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "advanceStandings", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/standings'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy bảng xếp hạng vòng bảng (group standings) cho giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('divisionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "getGroupStandings", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/results'),
    (0, swagger_1.ApiOperation)({ summary: 'Kết quả chính thức và vinh danh giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('divisionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "getTournamentResults", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/staff'),
    (0, swagger_1.ApiOperation)({ summary: 'Lay danh sach nhan su (BTC, trong tai, khach xem)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "findStaff", null);
__decorate([
    (0, common_1.Post)(':id/staff'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Them nhan su (CO_ORGANIZER, REFEREE, SPECTATOR)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, add_staff_member_dto_1.AddStaffMemberDto, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "addStaffMember", null);
__decorate([
    (0, common_1.Delete)(':id/staff/:userId'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xoa nhan su khoi giai' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TournamentsController.prototype, "removeStaffMember", null);
exports.TournamentsController = TournamentsController = __decorate([
    (0, swagger_1.ApiTags)('tournaments'),
    (0, common_1.Controller)('tournaments'),
    __metadata("design:paramtypes", [tournaments_service_1.TournamentsService,
        jwt_1.JwtService])
], TournamentsController);
//# sourceMappingURL=tournaments.controller.js.map