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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const users_service_1 = require("./users.service");
const update_user_dto_1 = require("./dto/update-user.dto");
const query_user_dto_1 = require("./dto/query-user.dto");
const change_password_dto_1 = require("./dto/change-password.dto");
const create_report_dto_1 = require("./dto/create-report.dto");
const query_my_reports_dto_1 = require("./dto/query-my-reports.dto");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const enums_1 = require("../../common/constants/enums");
const update_system_roles_dto_1 = require("./dto/update-system-roles.dto");
let UsersController = class UsersController {
    usersService;
    constructor(usersService) {
        this.usersService = usersService;
    }
    async findAll(query) {
        return this.usersService.findAll(query);
    }
    async searchPublic(q) {
        if (!q || q.trim().length < 2)
            return { data: [] };
        return this.usersService.findAll({ search: q, page: 1, limit: 10 });
    }
    async search(q) {
        if (!q || q.trim().length < 2)
            return [];
        return this.usersService.searchUsers(q);
    }
    async getProfile(user) {
        return this.usersService.getProfile(user.id);
    }
    async getMyReports(user, query) {
        return this.usersService.getMyReports(user.id, query);
    }
    async getPublicProfile(id) {
        return this.usersService.getPublicProfile(id);
    }
    async findOne(id) {
        return this.usersService.findOne(id);
    }
    async updateSystemRoles(admin, id, dto) {
        return this.usersService.updateSystemRoles(admin.id, id, dto.roles);
    }
    async updateProfile(user, updateUserDto) {
        return this.usersService.updateProfile(user.id, updateUserDto);
    }
    async uploadAvatar(user, file) {
        return this.usersService.uploadAvatar(user.id, file);
    }
    async uploadCover(user, file) {
        return this.usersService.uploadCover(user.id, file);
    }
    async changePassword(user, changePasswordDto) {
        return this.usersService.changePassword(user.id, changePasswordDto);
    }
    async remove(id) {
        return this.usersService.remove(id);
    }
    async createReport(user, dto) {
        return this.usersService.createReport(user.id, dto);
    }
    async deleteAccount(user, body) {
        return this.usersService.deleteAccount(user.id, body);
    }
    async createChangeRequest(user, body) {
        return this.usersService.createChangeRequest(user.id, body.requestType, body.newValue);
    }
    async findChangeRequests(status) {
        return this.usersService.findChangeRequests(status);
    }
    async approveChangeRequest(id, body) {
        return this.usersService.approveChangeRequest(id, body.adminNote);
    }
    async rejectChangeRequest(id, body) {
        return this.usersService.rejectChangeRequest(id, body.adminNote);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Get all users (Admin only)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Return list of users' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_user_dto_1.QueryUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('search/public'),
    (0, swagger_1.ApiOperation)({ summary: 'Tìm kiếm người dùng công khai để mời vào nhóm' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Danh sách người dùng khớp từ khoá' }),
    __param(0, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "searchPublic", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Tìm kiếm người dùng qua email hoặc số điện thoại' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Danh sách người dùng khớp từ khóa' }),
    __param(0, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('profile'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current user profile' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Return user profile' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Get)('reports/me'),
    (0, swagger_1.ApiOperation)({ summary: 'Xem và theo dõi các báo cáo vi phạm đã gửi' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, query_my_reports_dto_1.QueryMyReportsDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getMyReports", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id/public'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy thông tin hồ sơ công khai của người dùng' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Trả về hồ sơ công khai của người dùng' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getPublicProfile", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Get user by id (Admin only)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Return a single user' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Patch)(':id/system-roles'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Thay thế quyền hệ thống của người dùng (Admin)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Quyền hệ thống đã được cập nhật' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Không thể tự hạ quyền hoặc gỡ Admin cuối cùng' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_system_roles_dto_1.UpdateSystemRolesDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateSystemRoles", null);
__decorate([
    (0, common_1.Patch)('profile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update current user profile' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Profile updated' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, update_user_dto_1.UpdateUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Post)('profile/avatar'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    (0, swagger_1.ApiOperation)({ summary: 'Upload user avatar' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Avatar uploaded and profile updated' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)(new common_1.ParseFilePipe({
        validators: [
            new common_1.MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
            new common_1.FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
    }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "uploadAvatar", null);
__decorate([
    (0, common_1.Post)('profile/cover'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file')),
    (0, swagger_1.ApiOperation)({ summary: 'Upload user profile cover photo' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Cover photo uploaded and profile updated' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)(new common_1.ParseFilePipe({
        validators: [
            new common_1.MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
            new common_1.FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
    }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "uploadCover", null);
__decorate([
    (0, common_1.Patch)('change-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Change current user password' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Password changed successfully' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, change_password_dto_1.ChangePasswordDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({ summary: 'Soft delete user (Admin only)' }),
    (0, swagger_1.ApiResponse)({ status: 204, description: 'User deleted' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('reports'),
    (0, swagger_1.ApiOperation)({ summary: 'Gửi báo cáo vi phạm (Người dùng tố cáo)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_report_dto_1.CreateReportDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "createReport", null);
__decorate([
    (0, common_1.Post)('delete-account'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Người chơi tự xóa tài khoản cá nhân' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "deleteAccount", null);
__decorate([
    (0, common_1.Post)('change-requests'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Gửi yêu cầu thay đổi giới tính / email nhạy cảm' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "createChangeRequest", null);
__decorate([
    (0, common_1.Get)('admin/change-requests'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách yêu cầu đổi giới tính/email (Admin)' }),
    __param(0, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findChangeRequests", null);
__decorate([
    (0, common_1.Patch)('admin/change-requests/:id/approve'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Duyệt yêu cầu đổi giới tính/email (Admin)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "approveChangeRequest", null);
__decorate([
    (0, common_1.Patch)('admin/change-requests/:id/reject'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Từ chối yêu cầu đổi giới tính/email (Admin)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "rejectChangeRequest", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('users'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map