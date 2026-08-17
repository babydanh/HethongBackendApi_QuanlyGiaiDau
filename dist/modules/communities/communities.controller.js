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
exports.CommunitiesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const communities_service_1 = require("./communities.service");
const create_community_dto_1 = require("./dto/create-community.dto");
const update_community_dto_1 = require("./dto/update-community.dto");
const query_community_dto_1 = require("./dto/query-community.dto");
const query_members_dto_1 = require("./dto/query-members.dto");
const review_community_dto_1 = require("./dto/review-community.dto");
const add_member_dto_1 = require("./dto/add-member.dto");
const update_member_dto_1 = require("./dto/update-member.dto");
const update_member_tags_dto_1 = require("./dto/update-member-tags.dto");
const create_tag_preset_dto_1 = require("./dto/create-tag-preset.dto");
const join_community_dto_1 = require("./dto/join-community.dto");
const review_join_dto_1 = require("./dto/review-join.dto");
const invite_member_dto_1 = require("./dto/invite-member.dto");
const create_gallery_item_dto_1 = require("./dto/create-gallery-item.dto");
const update_notification_preference_dto_1 = require("./dto/update-notification-preference.dto");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const enums_1 = require("../../common/constants/enums");
const throttler_1 = require("@nestjs/throttler");
const optional_jwt_auth_guard_1 = require("../../common/guards/optional-jwt-auth.guard");
let CommunitiesController = class CommunitiesController {
    communitiesService;
    constructor(communitiesService) {
        this.communitiesService = communitiesService;
    }
    async findAll(query) {
        query.status = 'ACTIVE';
        return await this.communitiesService.findAll(query);
    }
    async findMyCommunities(user) {
        return await this.communitiesService.findMyCommunities(user.id);
    }
    async findMyInvites(user) {
        return await this.communitiesService.getMyInvites(user.id);
    }
    async findFavorites(user) {
        return await this.communitiesService.getFavorites(user.id);
    }
    async findPending(query) {
        query.status = 'PENDING';
        return await this.communitiesService.findAll(query);
    }
    async findAllAdmin(query) {
        return await this.communitiesService.findAll(query);
    }
    async getDashboard(id, user) {
        return await this.communitiesService.getDashboard(id, user);
    }
    async getMyMembership(user, id) {
        return await this.communitiesService.getMyMembership(user.id, id);
    }
    async findOne(id, user) {
        return await this.communitiesService.getPublicView(id, user);
    }
    async create(user, createCommunityDto) {
        return await this.communitiesService.create(user.id, createCommunityDto);
    }
    async update(user, id, updateCommunityDto) {
        return await this.communitiesService.update(user.id, id, updateCommunityDto, user.roles);
    }
    async review(user, id, reviewDto) {
        return await this.communitiesService.review(user.id, id, reviewDto, user.roles);
    }
    async remove(user, id) {
        return await this.communitiesService.remove(user.id, id, user.roles);
    }
    async getMembers(id, query, user) {
        return await this.communitiesService.getMembers(id, query, user);
    }
    async addMember(user, id, addMemberDto) {
        return await this.communitiesService.addMember(user.id, id, addMemberDto, user.roles);
    }
    async updateMemberRole(user, id, userId, updateMemberDto) {
        return await this.communitiesService.updateMemberRole(user.id, id, userId, updateMemberDto, user.roles);
    }
    async updateMemberTags(user, id, userId, updateMemberTagsDto) {
        return await this.communitiesService.updateMemberTags(user.id, id, userId, updateMemberTagsDto.tags, user.roles);
    }
    async getTagPresets(id) {
        return this.communitiesService.getTagPresets(id);
    }
    async createTagPreset(user, id, dto) {
        return this.communitiesService.createTagPreset(user.id, id, dto.name, dto.color, user.roles);
    }
    async deleteTagPreset(user, id, presetId) {
        return this.communitiesService.deleteTagPreset(user.id, id, presetId, user.roles);
    }
    async removeMember(user, id, userId) {
        return await this.communitiesService.removeMember(user.id, id, userId, user.roles);
    }
    async banMember(user, id, userId) {
        return await this.communitiesService.banMember(user.id, id, userId, user.roles);
    }
    async unbanMember(user, id, userId) {
        return await this.communitiesService.unbanMember(user.id, id, userId, user.roles);
    }
    async joinCommunity(user, id, body) {
        return await this.communitiesService.joinCommunity(user.id, id, body.joinAnswers);
    }
    async reviewJoinRequest(user, id, memberId, body) {
        return await this.communitiesService.reviewJoinRequest(user.id, id, memberId, body.action, user.roles);
    }
    async followCommunity(user, id) {
        return await this.communitiesService.followCommunity(user.id, id);
    }
    async unfollowCommunity(user, id) {
        return await this.communitiesService.unfollowCommunity(user.id, id);
    }
    async favoriteCommunity(user, id) {
        return await this.communitiesService.favoriteCommunity(user.id, id);
    }
    async unfavoriteCommunity(user, id) {
        return await this.communitiesService.unfavoriteCommunity(user.id, id);
    }
    async getJoinRequests(user, id) {
        return await this.communitiesService.getJoinRequests(user.id, id, user.roles);
    }
    async inviteMember(user, id, body) {
        return await this.communitiesService.inviteMember(user.id, id, body.userId, body.role, user.roles);
    }
    async respondToInvite(user, id, action) {
        const act = action === 'accept' ? 'ACCEPT' : 'DECLINE';
        return await this.communitiesService.respondToInvite(user.id, id, act);
    }
    async getGallery(id, user) {
        return await this.communitiesService.getGallery(id, user);
    }
    async addGalleryItem(user, id, body) {
        return await this.communitiesService.addGalleryItem(user.id, id, body.imageUrl, body.caption, user.roles);
    }
    async removeGalleryItem(user, id, imageId) {
        return await this.communitiesService.removeGalleryItem(user.id, id, imageId, user.roles);
    }
    async getTournaments(id, status, user) {
        return await this.communitiesService.getTournaments(id, status, user);
    }
    async getRankings(id, limit, user) {
        return await this.communitiesService.getRankings(id, limit ? Number(limit) : undefined, user);
    }
    async updateMyNotificationPreference(user, id, dto) {
        return await this.communitiesService.updateMemberNotificationPreference(id, user.id, dto.preference);
    }
    async getMyNotificationPreferences(user) {
        return await this.communitiesService.getMyNotificationPreferences(user.id);
    }
};
exports.CommunitiesController = CommunitiesController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách các cộng đồng' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Danh sách cộng đồng' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_community_dto_1.QueryCommunityDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('my'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách cộng đồng của tôi' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "findMyCommunities", null);
__decorate([
    (0, common_1.Get)('my/invites'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách lời mời tham gia cộng đồng của tôi' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "findMyInvites", null);
__decorate([
    (0, common_1.Get)('favorites'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách cộng đồng yêu thích' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "findFavorites", null);
__decorate([
    (0, common_1.Get)('pending'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách cộng đồng chờ duyệt (Chỉ ADMIN)' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_community_dto_1.QueryCommunityDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "findPending", null);
__decorate([
    (0, common_1.Get)('admin'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy tất cả cộng đồng (Admin) - bao gồm đã khoá' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_community_dto_1.QueryCommunityDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "findAllAdmin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    (0, throttler_1.Throttle)({ default: { limit: 1800, ttl: 60000 } }),
    (0, common_1.Get)(':id/dashboard'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy dữ liệu tổng quan (dashboard) của cộng đồng' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Dashboard tổng quan cộng đồng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "getDashboard", null);
__decorate([
    (0, common_1.Get)(':id/my-membership'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy membership của user hiện tại trong cộng đồng' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Membership của user hiện tại' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'User chưa tham gia cộng đồng (NOT_MEMBER)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "getMyMembership", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    (0, throttler_1.Throttle)({ default: { limit: 1800, ttl: 60000 } }),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy chi tiết 1 cộng đồng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo cộng đồng mới (User đã login)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_community_dto_1.CreateCommunityDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật cộng đồng (OWNER hoặc MODERATOR)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_community_dto_1.UpdateCommunityDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/review'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Duyệt / Từ chối cộng đồng (Chỉ ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, review_community_dto_1.ReviewCommunityDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "review", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa cộng đồng (OWNER hoặc ADMIN)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "remove", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    (0, throttler_1.Throttle)({ default: { limit: 1800, ttl: 60000 } }),
    (0, common_1.Get)(':id/members'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách thành viên cộng đồng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, query_members_dto_1.QueryMembersDto, Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "getMembers", null);
__decorate([
    (0, common_1.Post)(':id/members'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Thêm thành viên vào cộng đồng (OWNER/MODERATOR)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, add_member_dto_1.AddMemberDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "addMember", null);
__decorate([
    (0, common_1.Patch)(':id/members/:userId'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Sửa role thành viên (Chỉ OWNER)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, update_member_dto_1.UpdateMemberDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "updateMemberRole", null);
__decorate([
    (0, common_1.Patch)(':id/members/:userId/tags'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Gán/Xoá tag thành viên (OWNER/MODERATOR)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Member mới kèm tags' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Tag không hợp lệ (tối đa 5, 1-24 ký tự, không ký tự đặc biệt)' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: 'Không có quyền (cần OWNER/MODERATOR)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, update_member_tags_dto_1.UpdateMemberTagsDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "updateMemberTags", null);
__decorate([
    (0, common_1.Get)(':id/tag-presets'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "getTagPresets", null);
__decorate([
    (0, common_1.Post)(':id/tag-presets'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, create_tag_preset_dto_1.CreateTagPresetDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "createTagPreset", null);
__decorate([
    (0, common_1.Delete)(':id/tag-presets/:presetId'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('presetId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "deleteTagPreset", null);
__decorate([
    (0, common_1.Delete)(':id/members/:userId'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: 'Xóa thành viên khỏi cộng đồng (OWNER/MODERATOR hoặc tự rời đi)',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "removeMember", null);
__decorate([
    (0, common_1.Post)(':id/members/:userId/ban'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cấm thành viên khỏi cộng đồng (OWNER/MODERATOR theo quyền)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "banMember", null);
__decorate([
    (0, common_1.Delete)(':id/members/:userId/ban'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Gỡ cấm thành viên khỏi cộng đồng (OWNER/MODERATOR theo quyền)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "unbanMember", null);
__decorate([
    (0, common_1.Post)(':id/join'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xin tham gia cộng đồng' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, join_community_dto_1.JoinCommunityDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "joinCommunity", null);
__decorate([
    (0, common_1.Patch)(':id/join-requests/:memberId'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Duyệt/Từ chối đơn xin vào' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('memberId', common_1.ParseUUIDPipe)),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, review_join_dto_1.ReviewJoinDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "reviewJoinRequest", null);
__decorate([
    (0, common_1.Post)(':id/follow'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Theo dõi cộng đồng' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "followCommunity", null);
__decorate([
    (0, common_1.Delete)(':id/follow'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Bỏ theo dõi cộng đồng' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "unfollowCommunity", null);
__decorate([
    (0, common_1.Post)(':id/favorite'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Yêu thích cộng đồng' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "favoriteCommunity", null);
__decorate([
    (0, common_1.Delete)(':id/favorite'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Bỏ yêu thích cộng đồng' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "unfavoriteCommunity", null);
__decorate([
    (0, common_1.Get)(':id/join-requests'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Danh sách đơn xin vào' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "getJoinRequests", null);
__decorate([
    (0, common_1.Post)(':id/invite'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Mời thành viên' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, invite_member_dto_1.InviteMemberDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "inviteMember", null);
__decorate([
    (0, common_1.Post)(':id/invite/:action'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Chấp nhận/Từ chối lời mời' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('action')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "respondToInvite", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    (0, throttler_1.Throttle)({ default: { limit: 1800, ttl: 60000 } }),
    (0, common_1.Get)(':id/gallery'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy gallery ảnh' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "getGallery", null);
__decorate([
    (0, common_1.Post)(':id/gallery'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Upload ảnh lên gallery' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, create_gallery_item_dto_1.CreateGalleryItemDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "addGalleryItem", null);
__decorate([
    (0, common_1.Delete)(':id/gallery/:imageId'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xoá ảnh gallery' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Param)('imageId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "removeGalleryItem", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    (0, throttler_1.Throttle)({ default: { limit: 1800, ttl: 60000 } }),
    (0, common_1.Get)(':id/tournaments'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy giải đấu trong cộng đồng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "getTournaments", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    (0, throttler_1.Throttle)({ default: { limit: 1800, ttl: 60000 } }),
    (0, common_1.Get)(':id/rankings'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy bảng xếp hạng trong cộng đồng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "getRankings", null);
__decorate([
    (0, common_1.Put)(':id/members/me/notification-preference'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật cài đặt thông báo của cá nhân trong câu lạc bộ (ALL, MENTIONS_ONLY, MUTED)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_notification_preference_dto_1.UpdateNotificationPreferenceDto]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "updateMyNotificationPreference", null);
__decorate([
    (0, common_1.Get)('my/notification-preferences'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách cài đặt thông báo của các CLB mà user tham gia' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CommunitiesController.prototype, "getMyNotificationPreferences", null);
exports.CommunitiesController = CommunitiesController = __decorate([
    (0, swagger_1.ApiTags)('communities'),
    (0, common_1.Controller)('communities'),
    __metadata("design:paramtypes", [communities_service_1.CommunitiesService])
], CommunitiesController);
//# sourceMappingURL=communities.controller.js.map