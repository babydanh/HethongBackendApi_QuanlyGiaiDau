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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("./admin.service");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const enums_1 = require("../../common/constants/enums");
let AdminController = class AdminController {
    adminService;
    constructor(adminService) {
        this.adminService = adminService;
    }
    async getMetrics(groupBy) {
        return this.adminService.getMetrics(groupBy || 'month');
    }
    async getRevenueChart(groupBy, startDate, endDate) {
        return this.adminService.getRevenueChart(groupBy || 'month', startDate, endDate);
    }
    async getAuditLogs(page, limit, search, userId, cursor) {
        const pageNum = page ? parseInt(page, 10) : 1;
        const limitNum = limit ? parseInt(limit, 10) : 10;
        return this.adminService.getAuditLogs(pageNum, limitNum, search, userId, cursor);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('dashboard/metrics'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy dữ liệu GMV, doanh thu, escrow và số lượng giao dịch (Chỉ ADMIN)' }),
    (0, swagger_1.ApiQuery)({ name: 'groupBy', required: false, enum: ['day', 'week', 'month', 'year'], description: 'Gom nhóm thống kê và phần trăm tăng trưởng' }),
    __param(0, (0, common_1.Query)('groupBy')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getMetrics", null);
__decorate([
    (0, common_1.Get)('dashboard/revenue-chart'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy dữ liệu doanh thu và GMV theo thời gian (Chỉ ADMIN)' }),
    (0, swagger_1.ApiQuery)({ name: 'groupBy', required: false, enum: ['day', 'week', 'month', 'year'], description: 'Gom nhóm theo ngày, tuần, tháng hoặc năm' }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, type: String, description: 'Ngày bắt đầu lọc (YYYY-MM-DD)' }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, type: String, description: 'Ngày kết thúc lọc (YYYY-MM-DD)' }),
    __param(0, (0, common_1.Query)('groupBy')),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getRevenueChart", null);
__decorate([
    (0, common_1.Get)('audit-logs'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy nhật ký hoạt động hệ thống (Chỉ ADMIN)' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, description: 'Trang hiện tại' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: 'Số bản ghi mỗi trang' }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, type: String, description: 'Tìm kiếm theo bảng hoặc hành động' }),
    (0, swagger_1.ApiQuery)({ name: 'userId', required: false, type: String, description: 'Lọc theo ID người dùng' }),
    (0, swagger_1.ApiQuery)({ name: 'cursor', required: false, type: String }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('search')),
    __param(3, (0, common_1.Query)('userId')),
    __param(4, (0, common_1.Query)('cursor')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getAuditLogs", null);
exports.AdminController = AdminController = __decorate([
    (0, swagger_1.ApiTags)('admin'),
    (0, common_1.Controller)('admin'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map