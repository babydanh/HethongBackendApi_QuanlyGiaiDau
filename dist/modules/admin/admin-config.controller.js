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
exports.AdminConfigController = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("./admin.service");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const enums_1 = require("../../common/constants/enums");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const admin_dto_1 = require("./dto/admin.dto");
let AdminConfigController = class AdminConfigController {
    adminService;
    constructor(adminService) {
        this.adminService = adminService;
    }
    async getConfigs() {
        return this.adminService.getConfigs();
    }
    async updateConfig(admin, key, dto) {
        return this.adminService.updateConfig(key, dto.value, dto.description || '', admin.sub);
    }
};
exports.AdminConfigController = AdminConfigController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy toàn bộ danh sách cấu hình hệ thống (Chỉ ADMIN)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminConfigController.prototype, "getConfigs", null);
__decorate([
    (0, common_1.Put)(':key'),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo hoặc cập nhật cấu hình hệ thống (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, admin_dto_1.UpdateConfigDto]),
    __metadata("design:returntype", Promise)
], AdminConfigController.prototype, "updateConfig", null);
exports.AdminConfigController = AdminConfigController = __decorate([
    (0, swagger_1.ApiTags)('admin-config'),
    (0, common_1.Controller)('admin/configs'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminConfigController);
//# sourceMappingURL=admin-config.controller.js.map