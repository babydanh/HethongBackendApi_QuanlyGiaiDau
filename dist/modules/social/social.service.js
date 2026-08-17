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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialService = void 0;
const common_1 = require("@nestjs/common");
const social_repository_1 = require("./social.repository");
const update_friendship_dto_1 = require("./dto/update-friendship.dto");
let SocialService = class SocialService {
    socialRepository;
    constructor(socialRepository) {
        this.socialRepository = socialRepository;
    }
    async sendFriendRequest(userId, data) {
        if (userId === data.receiverId) {
            throw new common_1.BadRequestException('Cannot send friend request to yourself');
        }
        const existing = await this.socialRepository.findFriendship(userId, data.receiverId);
        if (existing) {
            throw new common_1.BadRequestException('Friendship or pending request already exists');
        }
        return this.socialRepository.createFriendRequest(userId, data.receiverId);
    }
    async respondToRequest(userId, friendshipId, data) {
        const status = data.action === update_friendship_dto_1.FriendshipAction.ACCEPT ? 'ACCEPTED' : 'REJECTED';
        return this.socialRepository.updateFriendshipStatus(friendshipId, status);
    }
    async getMyFriends(userId) {
        return this.socialRepository.getFriends(userId);
    }
};
exports.SocialService = SocialService;
exports.SocialService = SocialService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [social_repository_1.SocialRepository])
], SocialService);
//# sourceMappingURL=social.service.js.map