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
exports.MatchesController = void 0;
const common_1 = require("@nestjs/common");
const matches_service_1 = require("./matches.service");
const query_match_dto_1 = require("./dto/query-match.dto");
const operate_match_dto_1 = require("./dto/operate-match.dto");
const update_match_score_dto_1 = require("./dto/update-match-score.dto");
const update_match_status_dto_1 = require("./dto/update-match-status.dto");
const update_match_schedule_dto_1 = require("./dto/update-match-schedule.dto");
const create_match_comment_dto_1 = require("./dto/create-match-comment.dto");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const verified_decorator_1 = require("../../common/decorators/verified.decorator");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const enums_1 = require("../../common/constants/enums");
let MatchesController = class MatchesController {
    matchesService;
    constructor(matchesService) {
        this.matchesService = matchesService;
    }
    async findAll(query) {
        return this.matchesService.findAll(query);
    }
    async findOne(id) {
        return this.matchesService.findOne(id);
    }
    async getComments(id) {
        return await this.matchesService.getComments(id);
    }
    async createComment(id, createMatchCommentDto, user) {
        return await this.matchesService.createComment(id, user, createMatchCommentDto);
    }
    async updateScore(id, updateMatchScoreDto, user) {
        return await this.matchesService.updateScore(id, user, updateMatchScoreDto);
    }
    async updateStatus(id, updateMatchStatusDto, user) {
        return await this.matchesService.updateStatus(id, user, updateMatchStatusDto);
    }
    async updateSchedule(id, updateMatchScheduleDto, user) {
        return await this.matchesService.updateSchedule(id, user, updateMatchScheduleDto);
    }
    async operateMatch(id, operateMatchDto, user) {
        return await this.matchesService.operateMatch(id, user, operateMatchDto);
    }
    async assignReferee(id, body, user) {
        return await this.matchesService.assignReferee(id, body.refereeId, user);
    }
    async muteUser(id, body, user) {
        return await this.matchesService.muteUser(id, body.userId, body.type, body.reason, user);
    }
    async unmuteUser(id, userId, user) {
        return await this.matchesService.unmuteUser(id, userId, user);
    }
    async getMutedUsers(id, user) {
        return await this.matchesService.getMutedUsers(id, user);
    }
    async cheerMatch(id) {
        return await this.matchesService.cheerMatch(id);
    }
    async getCheerCount(id) {
        return await this.matchesService.getCheerCount(id);
    }
};
exports.MatchesController = MatchesController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách trận đấu' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_match_dto_1.QueryMatchDto]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "findAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy chi tiết trận đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "findOne", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Get)(':id/comments'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách bình luận trận đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "getComments", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Post)(':id/comments'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo bình luận trận đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_match_comment_dto_1.CreateMatchCommentDto, Object]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "createComment", null);
__decorate([
    (0, common_1.Patch)(':id/score'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật tỷ số trận đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_match_score_dto_1.UpdateMatchScoreDto, Object]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "updateScore", null);
__decorate([
    (0, common_1.Patch)(':id/status'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Cập nhật trạng thái trận đấu (ONGOING, COMPLETED)',
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_match_status_dto_1.UpdateMatchStatusDto, Object]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Patch)(':id/schedule'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật lịch thi đấu, sân đấu và trọng tài' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_match_schedule_dto_1.UpdateMatchScheduleDto, Object]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "updateSchedule", null);
__decorate([
    (0, common_1.Patch)(':id/operation'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Áp dụng quyết định nghiệp vụ đặc biệt cho trận đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, operate_match_dto_1.OperateMatchDto, Object]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "operateMatch", null);
__decorate([
    (0, common_1.Patch)(':id/assign-referee'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Phân công trọng tài cho trận đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "assignReferee", null);
__decorate([
    (0, common_1.Post)(':id/mute-user'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ORGANIZER, enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Mute/block người dùng trong trận đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "muteUser", null);
__decorate([
    (0, common_1.Delete)(':id/unmute-user/:userId'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ORGANIZER, enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Bỏ mute/unban người dùng trong trận đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "unmuteUser", null);
__decorate([
    (0, common_1.Get)(':id/muted-users'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ORGANIZER, enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Danh sách người dùng bị mute/ban' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "getMutedUsers", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Post)(':id/cheer'),
    (0, swagger_1.ApiOperation)({ summary: 'Cổ vũ trận đấu (tăng cheer count)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "cheerMatch", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Get)(':id/cheer-count'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy số lượng cổ vũ của trận đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MatchesController.prototype, "getCheerCount", null);
exports.MatchesController = MatchesController = __decorate([
    (0, swagger_1.ApiTags)('matches'),
    (0, throttler_1.SkipThrottle)(),
    (0, common_1.Controller)('matches'),
    __metadata("design:paramtypes", [matches_service_1.MatchesService])
], MatchesController);
//# sourceMappingURL=matches.controller.js.map