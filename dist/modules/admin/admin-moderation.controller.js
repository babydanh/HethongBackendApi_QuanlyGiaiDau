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
exports.AdminModerationController = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("./admin.service");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const enums_1 = require("../../common/constants/enums");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const admin_dto_1 = require("./dto/admin.dto");
let AdminModerationController = class AdminModerationController {
    adminService;
    constructor(adminService) {
        this.adminService = adminService;
    }
    async banUser(admin, userId, dto) {
        return this.adminService.banUser(userId, admin.sub, dto.reason, dto.banType, dto.expiresAt);
    }
    async unbanUser(admin, userId) {
        return this.adminService.unbanUser(userId, admin.sub);
    }
    async listReports(query) {
        return this.adminService.listReports(query);
    }
    async getReportActions(id) {
        return this.adminService.getReportActions(id);
    }
    async triageReport(moderator, id, dto) {
        return this.adminService.triageReport(id, moderator.sub, dto.note, dto.category);
    }
    async startReportReview(moderator, id, dto) {
        return this.adminService.startReportReview(id, moderator.sub, dto.note);
    }
    async escalateReport(moderator, id, dto) {
        return this.adminService.escalateReport(id, moderator.sub, dto.note);
    }
    async resolveReport(admin, id, dto) {
        return this.adminService.resolveReport(id, admin.sub, dto.status, dto.resolutionNote, (admin.roles ?? []).includes(enums_1.UserRole.ADMIN), dto.category);
    }
    async suspendTournament(admin, id, dto) {
        return this.adminService.suspendTournament(id, admin.sub, dto.note);
    }
    async unsuspendTournament(admin, id) {
        return this.adminService.unsuspendTournament(id, admin.sub);
    }
    async approveTournament(admin, id) {
        return this.adminService.approveTournament(id, admin.sub);
    }
    async rejectTournament(admin, id, dto) {
        return this.adminService.rejectTournament(id, admin.sub, dto.note);
    }
    async banTournament(admin, id, dto) {
        return this.adminService.banTournament(id, admin.sub, dto.note);
    }
    async approveDeleteTournament(admin, id) {
        return this.adminService.approveDeleteTournament(id, admin.sub);
    }
    async rejectDeleteTournament(admin, id, dto) {
        return this.adminService.rejectDeleteTournament(id, admin.sub, dto.note);
    }
    async listTournaments(page, limit, search, status, cursor) {
        const pageNum = page ? parseInt(page, 10) : 1;
        const limitNum = limit ? parseInt(limit, 10) : 10;
        return this.adminService.listTournaments(pageNum, limitNum, search, status, cursor);
    }
};
exports.AdminModerationController = AdminModerationController;
__decorate([
    (0, common_1.Post)('users/:id/ban'),
    (0, swagger_1.ApiOperation)({ summary: 'Phạt / Khóa tài khoản người dùng (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_dto_1.BanUserDto]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "banUser", null);
__decorate([
    (0, common_1.Post)('users/:id/unban'),
    (0, swagger_1.ApiOperation)({ summary: 'Mở khóa tài khoản người dùng (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "unbanUser", null);
__decorate([
    (0, common_1.Get)('reports'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách các báo cáo vi phạm (Chỉ ADMIN)' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_dto_1.QueryReportsDto]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "listReports", null);
__decorate([
    (0, common_1.Get)('reports/:id/actions'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Xem lịch sử xử lý của báo cáo vi phạm' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "getReportActions", null);
__decorate([
    (0, common_1.Post)('reports/:id/triage'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Phân loại và nhận xử lý báo cáo mới' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_dto_1.ReportWorkflowNoteDto]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "triageReport", null);
__decorate([
    (0, common_1.Post)('reports/:id/start-review'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Bắt đầu xác minh báo cáo đã phân loại' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_dto_1.ReportWorkflowNoteDto]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "startReportReview", null);
__decorate([
    (0, common_1.Post)('reports/:id/escalate'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Chuyển báo cáo lên admin để xem xét chế tài nặng' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_dto_1.ReportWorkflowNoteDto]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "escalateReport", null);
__decorate([
    (0, common_1.Post)('reports/:id/resolve'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Giải quyết hoặc từ chối báo cáo vi phạm (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_dto_1.ResolveReportDto]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "resolveReport", null);
__decorate([
    (0, common_1.Post)('tournaments/:id/suspend'),
    (0, swagger_1.ApiOperation)({ summary: 'Tạm đình chỉ hoạt động của giải đấu (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_dto_1.TournamentAdminActionDto]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "suspendTournament", null);
__decorate([
    (0, common_1.Post)('tournaments/:id/unsuspend'),
    (0, swagger_1.ApiOperation)({ summary: 'Khôi phục hoạt động giải đấu bị đình chỉ (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "unsuspendTournament", null);
__decorate([
    (0, common_1.Post)('tournaments/:id/approve'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Duyệt giải đấu tính điểm ELO (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "approveTournament", null);
__decorate([
    (0, common_1.Post)('tournaments/:id/reject'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Từ chối duyệt giải đấu tính điểm ELO (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_dto_1.TournamentAdminActionDto]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "rejectTournament", null);
__decorate([
    (0, common_1.Post)('tournaments/:id/ban'),
    (0, swagger_1.ApiOperation)({ summary: 'Hủy/Cấm vĩnh viễn giải đấu (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_dto_1.TournamentAdminActionDto]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "banTournament", null);
__decorate([
    (0, common_1.Post)('tournaments/:id/approve-delete'),
    (0, swagger_1.ApiOperation)({ summary: 'Duyệt yêu cầu xóa giải đấu (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "approveDeleteTournament", null);
__decorate([
    (0, common_1.Post)('tournaments/:id/reject-delete'),
    (0, swagger_1.ApiOperation)({ summary: 'Từ chối yêu cầu xóa giải đấu (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_dto_1.TournamentAdminActionDto]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "rejectDeleteTournament", null);
__decorate([
    (0, common_1.Get)('tournaments'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách giải đấu để quản lý (Chỉ ADMIN)' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'cursor', required: false, type: String }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('search')),
    __param(3, (0, common_1.Query)('status')),
    __param(4, (0, common_1.Query)('cursor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], AdminModerationController.prototype, "listTournaments", null);
exports.AdminModerationController = AdminModerationController = __decorate([
    (0, swagger_1.ApiTags)('admin-moderation'),
    (0, common_1.Controller)('admin'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminModerationController);
//# sourceMappingURL=admin-moderation.controller.js.map