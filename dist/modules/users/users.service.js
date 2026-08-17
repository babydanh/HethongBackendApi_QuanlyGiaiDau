"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcrypt"));
const users_repository_1 = require("./users.repository");
const error_messages_1 = require("../../common/constants/error-messages");
const storage_service_1 = require("../../providers/storage/storage.service");
const rankings_service_1 = require("../rankings/rankings.service");
const notifications_service_1 = require("../notifications/notifications.service");
const cloudinary_helper_1 = require("../../common/helpers/cloudinary.helper");
const enums_1 = require("../../common/constants/enums");
let UsersService = class UsersService {
    usersRepository;
    storageService;
    rankingsService;
    notificationsService;
    constructor(usersRepository, storageService, rankingsService, notificationsService) {
        this.usersRepository = usersRepository;
        this.storageService = storageService;
        this.rankingsService = rankingsService;
        this.notificationsService = notificationsService;
    }
    normalizeGenderValue(value) {
        const normalized = String(value ?? '')
            .trim()
            .toUpperCase()
            .replace(/[-–\s]/g, '_');
        if (['MALE', 'MEN', 'NAM'].includes(normalized))
            return 'MALE';
        if (['FEMALE', 'WOMEN', 'NU', 'NỮ'].includes(normalized))
            return 'FEMALE';
        return null;
    }
    async findAll(query) {
        return await this.usersRepository.findAll(query);
    }
    async findOne(id) {
        const user = await this.usersRepository.findById(id);
        if (!user) {
            throw new common_1.NotFoundException(error_messages_1.ERROR_MESSAGES.USER_NOT_FOUND);
        }
        const { passwordHash, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }
    async updateSystemRoles(actorId, targetUserId, roles) {
        if (actorId === targetUserId) {
            throw new common_1.BadRequestException('Bạn không thể tự thay đổi quyền hệ thống của mình từ trang quản trị.');
        }
        const effectiveRoles = Array.from(new Set([
            enums_1.UserRole.PLAYER,
            ...roles,
        ]));
        try {
            const updatedRoles = await this.usersRepository.replaceSystemRoles(targetUserId, effectiveRoles, actorId);
            if (!updatedRoles) {
                throw new common_1.NotFoundException(error_messages_1.ERROR_MESSAGES.USER_NOT_FOUND);
            }
            return { userId: targetUserId, roles: updatedRoles };
        }
        catch (error) {
            if (error instanceof Error && error.message === 'SYSTEM_ROLE_NOT_FOUND') {
                throw new common_1.BadRequestException('Một hoặc nhiều quyền hệ thống chưa được khởi tạo.');
            }
            if (error instanceof Error && error.message === 'LAST_ADMIN') {
                throw new common_1.BadRequestException('Không thể gỡ quyền của quản trị viên hệ thống cuối cùng.');
            }
            if (error instanceof Error && error.message === 'ACTOR_NOT_ADMIN') {
                throw new common_1.ForbiddenException('Quyền quản trị của bạn không còn hiệu lực. Vui lòng đăng nhập lại.');
            }
            throw error;
        }
    }
    async getProfile(userId) {
        return this.findOne(userId);
    }
    async updateProfile(userId, updateUserDto) {
        const currentUser = await this.findOne(userId);
        if (updateUserDto.gender !== undefined &&
            currentUser.profile?.isGenderLocked &&
            this.normalizeGenderValue(updateUserDto.gender) !==
                this.normalizeGenderValue(currentUser.profile.gender)) {
            throw new common_1.BadRequestException('Giới tính của bạn đã bị khóa. Vui lòng gửi yêu cầu hỗ trợ tới Admin để được cập nhật.');
        }
        const updateData = { ...updateUserDto };
        await this.usersRepository.updateProfile(userId, updateData);
        if (updateData.provinceCode !== undefined &&
            updateData.provinceCode !== currentUser.profile?.provinceCode) {
            await this.rankingsService.recalculateUserTiersOnProvinceChange(userId);
        }
        return this.findOne(userId);
    }
    async uploadAvatar(userId, file) {
        if (!file) {
            throw new common_1.BadRequestException('File is required');
        }
        const currentUser = await this.findOne(userId);
        const oldAvatarUrl = currentUser.profile?.avatarUrl;
        const result = await this.storageService.uploadFile(file);
        const avatarUrl = result.secure_url;
        if ((0, cloudinary_helper_1.isStoredImageUrl)(oldAvatarUrl)) {
            try {
                const publicId = (0, cloudinary_helper_1.extractStoredImagePublicId)(oldAvatarUrl);
                if (publicId) {
                    await this.storageService.deleteFile(publicId);
                }
            }
            catch (err) {
                console.error('Failed to delete old avatar:', err);
            }
        }
        await this.usersRepository.updateProfile(userId, { avatarUrl });
        return this.findOne(userId);
    }
    async uploadCover(userId, file) {
        if (!file) {
            throw new common_1.BadRequestException('File is required');
        }
        const currentUser = await this.findOne(userId);
        const oldCoverUrl = currentUser.profile?.coverUrl;
        const result = await this.storageService.uploadFile(file);
        const coverUrl = result.secure_url;
        if ((0, cloudinary_helper_1.isStoredImageUrl)(oldCoverUrl)) {
            try {
                const publicId = (0, cloudinary_helper_1.extractStoredImagePublicId)(oldCoverUrl);
                if (publicId) {
                    await this.storageService.deleteFile(publicId);
                }
            }
            catch (err) {
                console.error('Failed to delete old cover:', err);
            }
        }
        await this.usersRepository.updateProfile(userId, { coverUrl });
        return this.findOne(userId);
    }
    async changePassword(userId, changePasswordDto) {
        const user = await this.usersRepository.findById(userId);
        if (!user) {
            throw new common_1.NotFoundException(error_messages_1.ERROR_MESSAGES.USER_NOT_FOUND);
        }
        if (!user.passwordHash) {
            throw new common_1.BadRequestException('Tài khoản này được đăng ký qua Google, không thể đổi mật khẩu theo cách này.');
        }
        const isPasswordValid = await bcrypt.compare(changePasswordDto.oldPassword, user.passwordHash);
        if (!isPasswordValid) {
            throw new common_1.BadRequestException('Old password is incorrect');
        }
        const hashedNewPassword = await bcrypt.hash(changePasswordDto.newPassword, 12);
        await this.usersRepository.updatePassword(userId, hashedNewPassword);
        return { message: 'Password changed successfully' };
    }
    async remove(id) {
        await this.findOne(id);
        await this.usersRepository.softDelete(id);
        return { message: 'User deleted successfully' };
    }
    async getPublicProfile(id) {
        const profile = await this.usersRepository.getPublicProfile(id);
        if (!profile) {
            throw new common_1.NotFoundException('User profile not found');
        }
        return profile;
    }
    async createReport(reporterId, dto) {
        if (dto.targetType === 'USER' && dto.targetId === reporterId) {
            throw new common_1.BadRequestException('Bạn không thể tự báo cáo chính mình');
        }
        const targetExists = await this.usersRepository.reportTargetExists(dto.targetType, dto.targetId);
        if (!targetExists) {
            throw new common_1.NotFoundException('Đối tượng báo cáo không tồn tại hoặc đã bị xóa');
        }
        let report;
        try {
            report = await this.usersRepository.createReport(reporterId, dto.targetType, dto.targetId, dto.category, dto.reason, dto.evidenceUrls || []);
        }
        catch (error) {
            if (typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                error.code === '23505') {
                throw new common_1.ConflictException('Bạn đã có một báo cáo đang được xử lý cho đối tượng và nhóm vi phạm này');
            }
            throw error;
        }
        try {
            await this.notificationsService.sendNotification({
                receiverId: reporterId,
                type: 'REPORT_SUBMITTED',
                title: 'Đã tiếp nhận báo cáo vi phạm',
                content: 'Báo cáo của bạn đã được ghi nhận và đang chờ điều phối viên phân loại.',
                redirectUrl: `/profile/reports?reportId=${report.id}`,
            });
        }
        catch (error) {
            console.error('Không thể gửi thông báo tiếp nhận báo cáo:', error);
        }
        return report;
    }
    async getMyReports(reporterId, query) {
        return this.usersRepository.getMyReports(reporterId, query);
    }
    async searchUsers(query) {
        return this.usersRepository.searchUsers(query);
    }
    async createChangeRequest(userId, requestType, newValue) {
        const user = await this.usersRepository.findById(userId);
        if (!user) {
            throw new common_1.NotFoundException('Không tìm thấy người dùng');
        }
        const oldValue = requestType === 'GENDER' ? (user.profile?.gender || '') : user.email;
        const [request] = await this.usersRepository.createChangeRequest(userId, requestType, oldValue, newValue);
        return request;
    }
    async findChangeRequests(status) {
        return await this.usersRepository.findChangeRequests(status);
    }
    async approveChangeRequest(id, adminNote) {
        const request = await this.usersRepository.findChangeRequestById(id);
        if (!request) {
            throw new common_1.NotFoundException('Yêu cầu không tồn tại');
        }
        if (request.status !== 'PENDING') {
            throw new common_1.BadRequestException('Yêu cầu này đã được xử lý trước đó');
        }
        if (request.requestType === 'GENDER') {
            await this.usersRepository.updateProfile(request.userId, { gender: request.newValue });
        }
        else if (request.requestType === 'EMAIL') {
            await this.usersRepository.verifyEmail(request.userId);
            await this.usersRepository.updateProfile(request.userId, { address: request.newValue });
        }
        const [updated] = await this.usersRepository.updateChangeRequestStatus(id, 'APPROVED', adminNote);
        return updated;
    }
    async rejectChangeRequest(id, adminNote) {
        const request = await this.usersRepository.findChangeRequestById(id);
        if (!request) {
            throw new common_1.NotFoundException('Yêu cầu không tồn tại');
        }
        if (request.status !== 'PENDING') {
            throw new common_1.BadRequestException('Yêu cầu này đã được xử lý trước đó');
        }
        const [updated] = await this.usersRepository.updateChangeRequestStatus(id, 'REJECTED', adminNote);
        return updated;
    }
    async deleteAccount(userId, changePasswordDto) {
        const user = await this.usersRepository.findById(userId);
        if (!user) {
            throw new common_1.NotFoundException(error_messages_1.ERROR_MESSAGES.USER_NOT_FOUND);
        }
        if (!user.passwordHash) {
            throw new common_1.BadRequestException('Tài khoản được đăng ký qua Google, vui lòng liên hệ Admin để thực hiện xóa');
        }
        const isPasswordValid = await bcrypt.compare(changePasswordDto.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new common_1.BadRequestException('Mật khẩu xác nhận không chính xác');
        }
        await this.usersRepository.softDelete(userId);
        return { success: true, message: 'Tài khoản của bạn đã được xóa thành công' };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_repository_1.UsersRepository,
        storage_service_1.StorageService,
        rankings_service_1.RankingsService,
        notifications_service_1.NotificationsService])
], UsersService);
//# sourceMappingURL=users.service.js.map