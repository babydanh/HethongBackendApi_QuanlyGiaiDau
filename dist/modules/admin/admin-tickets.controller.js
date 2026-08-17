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
exports.AdminTicketsController = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("./admin.service");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const enums_1 = require("../../common/constants/enums");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const admin_dto_1 = require("./dto/admin.dto");
let AdminTicketsController = class AdminTicketsController {
    adminService;
    constructor(adminService) {
        this.adminService = adminService;
    }
    async submit(user, dto) {
        return this.adminService.submitVerificationTicket(user.sub, dto.evidenceUrls, dto.contactPhone);
    }
    async getMyTickets(user) {
        return this.adminService.getUserVerificationTickets(user.sub);
    }
    async list(status, page, limit, cursor) {
        const pageNum = page ? parseInt(page, 10) : 1;
        const limitNum = limit ? parseInt(limit, 10) : 10;
        return this.adminService.listVerificationTickets(status, pageNum, limitNum, cursor);
    }
    async approve(admin, id) {
        return this.adminService.approveVerificationTicket(id, admin.sub);
    }
    async reject(admin, id, dto) {
        return this.adminService.rejectVerificationTicket(id, admin.sub, dto.rejectReason);
    }
};
exports.AdminTicketsController = AdminTicketsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Gửi yêu cầu xác minh tài khoản người dùng' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, admin_dto_1.SubmitTicketDto]),
    __metadata("design:returntype", Promise)
], AdminTicketsController.prototype, "submit", null);
__decorate([
    (0, common_1.Get)('my'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách các yêu cầu xác minh của tôi' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminTicketsController.prototype, "getMyTickets", null);
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách các yêu cầu xác minh (Chỉ ADMIN)' }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: ['PENDING', 'APPROVED', 'REJECTED'] }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'cursor', required: false, type: String }),
    __param(0, (0, common_1.Query)('status')),
    __param(1, (0, common_1.Query)('page')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('cursor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], AdminTicketsController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)(':id/approve'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Phê duyệt yêu cầu xác minh (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AdminTicketsController.prototype, "approve", null);
__decorate([
    (0, common_1.Patch)(':id/reject'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Từ chối yêu cầu xác minh (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_dto_1.RejectTicketDto]),
    __metadata("design:returntype", Promise)
], AdminTicketsController.prototype, "reject", null);
exports.AdminTicketsController = AdminTicketsController = __decorate([
    (0, swagger_1.ApiTags)('admin-tickets'),
    (0, common_1.Controller)('admin/verification-tickets'),
    (0, swagger_1.ApiBearerAuth)(),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminTicketsController);
//# sourceMappingURL=admin-tickets.controller.js.map