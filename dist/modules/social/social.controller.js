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
exports.SocialController = void 0;
const common_1 = require("@nestjs/common");
const social_service_1 = require("./social.service");
const send_friend_request_dto_1 = require("./dto/send-friend-request.dto");
const update_friendship_dto_1 = require("./dto/update-friendship.dto");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let SocialController = class SocialController {
    socialService;
    constructor(socialService) {
        this.socialService = socialService;
    }
    async sendFriendRequest(sendFriendRequestDto, user) {
        return this.socialService.sendFriendRequest(user.sub, sendFriendRequestDto);
    }
    async respondToRequest(id, updateFriendshipDto, user) {
        return this.socialService.respondToRequest(user.sub, id, updateFriendshipDto);
    }
    async getFriends(user) {
        return this.socialService.getMyFriends(user.sub);
    }
};
exports.SocialController = SocialController;
__decorate([
    (0, common_1.Post)('friend-requests'),
    (0, swagger_1.ApiOperation)({ summary: 'Gửi lời mời kết bạn' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_friend_request_dto_1.SendFriendRequestDto, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "sendFriendRequest", null);
__decorate([
    (0, common_1.Patch)('friend-requests/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Phản hồi lời mời kết bạn (Chấp nhận/Từ chối)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_friendship_dto_1.UpdateFriendshipDto, Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "respondToRequest", null);
__decorate([
    (0, common_1.Get)('friends'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách bạn bè (và lời mời)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SocialController.prototype, "getFriends", null);
exports.SocialController = SocialController = __decorate([
    (0, swagger_1.ApiTags)('social'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('social'),
    __metadata("design:paramtypes", [social_service_1.SocialService])
], SocialController);
//# sourceMappingURL=social.controller.js.map