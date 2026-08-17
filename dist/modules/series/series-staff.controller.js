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
exports.OrganizerSeriesStaffController = exports.SeriesInvitationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const series_service_1 = require("./series.service");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const verified_decorator_1 = require("../../common/decorators/verified.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const enums_1 = require("../../common/constants/enums");
let SeriesInvitationsController = class SeriesInvitationsController {
    seriesService;
    constructor(seriesService) {
        this.seriesService = seriesService;
    }
    async acceptInvitation(id, user) {
        return this.seriesService.acceptInvitation(id, user);
    }
    async rejectInvitation(id, user) {
        return this.seriesService.rejectInvitation(id, user);
    }
};
exports.SeriesInvitationsController = SeriesInvitationsController;
__decorate([
    (0, common_1.Post)(':id/accept'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Chấp nhận lời mời làm nhân sự chuỗi giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SeriesInvitationsController.prototype, "acceptInvitation", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Từ chối lời mời làm nhân sự chuỗi giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SeriesInvitationsController.prototype, "rejectInvitation", null);
exports.SeriesInvitationsController = SeriesInvitationsController = __decorate([
    (0, swagger_1.ApiTags)('series-staff'),
    (0, common_1.Controller)('series/invitations'),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [series_service_1.SeriesService])
], SeriesInvitationsController);
let OrganizerSeriesStaffController = class OrganizerSeriesStaffController {
    seriesService;
    constructor(seriesService) {
        this.seriesService = seriesService;
    }
    async inviteStaff(id, body, user) {
        return this.seriesService.inviteStaff(id, user.sub, body.emailOrPhone, body.role, [user.role]);
    }
    async listInvitations(id, user) {
        return this.seriesService.listInvitations(id, user.sub, [user.role]);
    }
    async listManagers(id) {
        return this.seriesService.listManagers(id);
    }
    async revokeManager(id, userIdToRevoke, user) {
        return this.seriesService.revokeManager(id, userIdToRevoke, user.sub, [user.role]);
    }
};
exports.OrganizerSeriesStaffController = OrganizerSeriesStaffController;
__decorate([
    (0, common_1.Post)(':id/invitations'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Mời một nhân sự tham gia vận hành chuỗi giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesStaffController.prototype, "inviteStaff", null);
__decorate([
    (0, common_1.Get)(':id/invitations'),
    (0, swagger_1.ApiOperation)({ summary: 'Xem danh sách các lời mời của chuỗi giải đấu' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesStaffController.prototype, "listInvitations", null);
__decorate([
    (0, common_1.Get)(':id/managers'),
    (0, swagger_1.ApiOperation)({ summary: 'Xem danh sách quản trị viên và nhân sự của chuỗi' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesStaffController.prototype, "listManagers", null);
__decorate([
    (0, common_1.Delete)(':id/managers/:userId'),
    (0, verified_decorator_1.Verified)(),
    (0, swagger_1.ApiOperation)({ summary: 'Thu hồi quyền quản trị viên/nhân sự chặng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], OrganizerSeriesStaffController.prototype, "revokeManager", null);
exports.OrganizerSeriesStaffController = OrganizerSeriesStaffController = __decorate([
    (0, swagger_1.ApiTags)('organizer-series-staff'),
    (0, common_1.Controller)('organizer/series'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ORGANIZER, enums_1.UserRole.ADMIN),
    __metadata("design:paramtypes", [series_service_1.SeriesService])
], OrganizerSeriesStaffController);
//# sourceMappingURL=series-staff.controller.js.map