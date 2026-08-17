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
exports.CommunitySocialController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const community_social_service_1 = require("./community-social.service");
const create_community_post_dto_1 = require("./dto/create-community-post.dto");
const query_community_posts_dto_1 = require("./dto/query-community-posts.dto");
const create_community_comment_dto_1 = require("./dto/create-community-comment.dto");
const react_community_post_dto_1 = require("./dto/react-community-post.dto");
const update_community_social_settings_dto_1 = require("./dto/update-community-social-settings.dto");
const report_community_content_dto_1 = require("./dto/report-community-content.dto");
const update_community_preferences_dto_1 = require("./dto/update-community-preferences.dto");
const moderate_community_post_dto_1 = require("./dto/moderate-community-post.dto");
const optional_jwt_auth_guard_1 = require("../../common/guards/optional-jwt-auth.guard");
const update_community_comment_dto_1 = require("./dto/update-community-comment.dto");
const moderate_community_comment_dto_1 = require("./dto/moderate-community-comment.dto");
let CommunitySocialController = class CommunitySocialController {
    socialService;
    constructor(socialService) {
        this.socialService = socialService;
    }
    getSettings(communityId) {
        return this.socialService.getSettings(communityId);
    }
    updateSettings(communityId, user, dto) {
        return this.socialService.updateSettings(communityId, user, dto);
    }
    listPosts(communityId, query, user) {
        return this.socialService.listPosts(communityId, query.limit ?? 20, query.cursor, user);
    }
    createPost(communityId, user, dto, idempotencyKey) {
        return this.socialService.createPost(communityId, user, dto, idempotencyKey);
    }
    deletePost(communityId, postId, user) {
        return this.socialService.deletePost(communityId, postId, user);
    }
    listComments(communityId, postId, limit, cursor, user) {
        return this.socialService.listComments(communityId, postId, Math.min(Math.max(Number(limit) || 20, 1), 50), cursor, user);
    }
    createComment(communityId, postId, user, dto) {
        return this.socialService.createComment(communityId, postId, user, dto);
    }
    updateComment(communityId, commentId, user, dto) {
        return this.socialService.updateComment(communityId, commentId, user, dto);
    }
    deleteComment(communityId, commentId, user) {
        return this.socialService.deleteComment(communityId, commentId, user);
    }
    moderateComment(communityId, commentId, user, dto) {
        return this.socialService.moderateComment(communityId, commentId, user, dto.status, dto.reason);
    }
    listPendingPosts(communityId, user) {
        return this.socialService.listPendingPosts(communityId, user);
    }
    react(communityId, postId, user, dto) {
        return this.socialService.react(communityId, postId, user, dto.reactionType);
    }
    report(communityId, postId, user, dto) {
        return this.socialService.report(communityId, postId, user, dto);
    }
    moderate(communityId, postId, user, dto) {
        return this.socialService.moderatePost(communityId, postId, user, dto.status);
    }
    updatePreferences(communityId, user, dto) {
        return this.socialService.updatePreferences(communityId, user, dto);
    }
    votePoll(communityId, pollId, user, optionId) {
        return this.socialService.votePoll(communityId, pollId, optionId, user);
    }
    addPollOption(communityId, pollId, user, optionText) {
        return this.socialService.addPollOption(communityId, pollId, optionText, user);
    }
    closePoll(communityId, pollId, user) {
        return this.socialService.closePoll(communityId, pollId, user);
    }
};
exports.CommunitySocialController = CommunitySocialController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('social-settings'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy cài đặt không gian sinh hoạt cộng đồng' }),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Patch)('social-settings'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, update_community_social_settings_dto_1.UpdateCommunitySocialSettingsDto]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "updateSettings", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    (0, common_1.Get)('posts'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy feed bài viết theo cursor, thứ tự mới nhất trước' }),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, query_community_posts_dto_1.QueryCommunityPostsDto, Object]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "listPosts", null);
__decorate([
    (0, common_1.Post)('posts'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Đăng bài vào cộng đồng' }),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, create_community_post_dto_1.CreateCommunityPostDto, String]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "createPost", null);
__decorate([
    (0, common_1.Delete)('posts/:postId'),
    (0, common_1.Post)('posts/:postId/delete'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa bài viết (tác giả hoặc BQT)' }),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('postId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "deletePost", null);
__decorate([
    (0, common_1.Get)('posts/:postId/comments'),
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(optional_jwt_auth_guard_1.OptionalJwtAuthGuard),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('postId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('cursor')),
    __param(4, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, String, Object]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "listComments", null);
__decorate([
    (0, common_1.Post)('posts/:postId/comments'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('postId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, create_community_comment_dto_1.CreateCommunityCommentDto]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "createComment", null);
__decorate([
    (0, common_1.Patch)('comments/:commentId'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('commentId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, update_community_comment_dto_1.UpdateCommunityCommentDto]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "updateComment", null);
__decorate([
    (0, common_1.Post)('comments/:commentId/delete'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('commentId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "deleteComment", null);
__decorate([
    (0, common_1.Patch)('comments/:commentId/moderation'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('commentId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, moderate_community_comment_dto_1.ModerateCommunityCommentDto]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "moderateComment", null);
__decorate([
    (0, common_1.Get)('moderation/posts'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "listPendingPosts", null);
__decorate([
    (0, common_1.Post)('posts/:postId/reaction'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('postId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, react_community_post_dto_1.ReactCommunityPostDto]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "react", null);
__decorate([
    (0, common_1.Post)('posts/:postId/report'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('postId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, report_community_content_dto_1.ReportCommunityContentDto]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "report", null);
__decorate([
    (0, common_1.Patch)('posts/:postId/moderation'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('postId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, moderate_community_post_dto_1.ModerateCommunityPostDto]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "moderate", null);
__decorate([
    (0, common_1.Patch)('social-preferences'),
    (0, swagger_1.ApiBearerAuth)(),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, update_community_preferences_dto_1.UpdateCommunityPreferencesDto]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "updatePreferences", null);
__decorate([
    (0, common_1.Post)('polls/:pollId/vote'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Bình chọn hoặc hủy bình chọn một lựa chọn trong poll' }),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('pollId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)('optionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "votePoll", null);
__decorate([
    (0, common_1.Post)('polls/:pollId/options'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Thêm một lựa chọn mới vào poll' }),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('pollId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)('optionText')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "addPollOption", null);
__decorate([
    (0, common_1.Post)('polls/:pollId/close'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Kết thúc cuộc bình chọn sớm' }),
    __param(0, (0, common_1.Param)('communityId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('pollId', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], CommunitySocialController.prototype, "closePoll", null);
exports.CommunitySocialController = CommunitySocialController = __decorate([
    (0, swagger_1.ApiTags)('community-social'),
    (0, common_1.Controller)('communities/:communityId'),
    __metadata("design:paramtypes", [community_social_service_1.CommunitySocialService])
], CommunitySocialController);
//# sourceMappingURL=community-social.controller.js.map