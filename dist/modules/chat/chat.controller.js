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
exports.ChatController = void 0;
const common_1 = require("@nestjs/common");
const chat_service_1 = require("./chat.service");
const create_room_dto_1 = require("./dto/create-room.dto");
const get_club_room_query_dto_1 = require("./dto/get-club-room-query.dto");
const create_message_dto_1 = require("./dto/create-message.dto");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const create_support_conversation_dto_1 = require("./dto/create-support-conversation.dto");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const enums_1 = require("../../common/constants/enums");
const send_support_message_dto_1 = require("./dto/send-support-message.dto");
const rate_limit_guard_1 = require("../../common/guards/rate-limit.guard");
const query_chat_messages_dto_1 = require("./dto/query-chat-messages.dto");
let ChatController = class ChatController {
    chatService;
    constructor(chatService) {
        this.chatService = chatService;
    }
    async getMyRooms(query, user) {
        if (query.type === create_room_dto_1.RoomType.CLUB) {
            if (!query.communityId) {
                throw new common_1.BadRequestException('communityId là bắt buộc khi type=CLUB');
            }
            return this.chatService.getOrCreateClubRoom(query.communityId, user.sub);
        }
        return this.chatService.getUserRooms(user.sub);
    }
    async createRoom(createRoomDto, user) {
        return this.chatService.createRoom(user.sub, createRoomDto);
    }
    async sendMessage(createMessageDto, user) {
        return this.chatService.sendMessage(user.sub, createMessageDto);
    }
    async getMessages(id, query, user) {
        return this.chatService.getMessages(user.sub, id, query.limit, query.cursor);
    }
    async markRoomRead(id, user) {
        return this.chatService.markRoomRead(user.sub, id);
    }
    async clearRoom(id, user) {
        return this.chatService.clearRoomMessages(user.sub, id);
    }
    async getUnreadCount(id, user) {
        return this.chatService.getUnreadCount(user.sub, id);
    }
    async getMySupportConversation(user) {
        return this.chatService.getMySupportConversation(user.sub);
    }
    async revokeMessage(id, user) {
        return this.chatService.revokeMessage(user.sub, id);
    }
    async pinMessage(roomId, id, user) {
        return this.chatService.pinMessage(user.sub, roomId, id);
    }
    async unpinMessage(roomId, id, user) {
        return this.chatService.unpinMessage(user.sub, roomId, id);
    }
    async getPinnedMessage(roomId, user) {
        return this.chatService.getPinnedMessage(user.sub, roomId);
    }
    async toggleReaction(id, body, user) {
        return this.chatService.toggleReaction(user.sub, id, body.emoji);
    }
    async votePoll(id, body, user) {
        return this.chatService.votePoll(user.sub, id, body.optionId);
    }
    async getLinkPreview(url) {
        return this.chatService.getLinkPreview(url);
    }
    async updateClubRoomSettings(roomId, body, user) {
        return this.chatService.updateClubRoomSettings(user.sub, roomId, body);
    }
    async getBlockedUsers(user) {
        return this.chatService.getBlockedUsers(user.sub);
    }
    async blockUser(userId, user) {
        return this.chatService.blockUser(user.sub, userId);
    }
    async unblockUser(userId, user) {
        return this.chatService.unblockUser(user.sub, userId);
    }
    async openSupportConversation(dto, user) {
        return this.chatService.openSupportConversation(user.sub, dto);
    }
    async getAdminSupportRooms() {
        return this.chatService.getAdminSupportRooms();
    }
    async getAdminSupportMessages(id) {
        return this.chatService.getAdminSupportMessages(id);
    }
    async markAdminSupportRoomRead(id) {
        return this.chatService.markAdminSupportRoomRead(id);
    }
    async sendAdminSupportMessage(id, body, user) {
        return this.chatService.sendAdminSupportMessage(user.sub, id, body.messageText);
    }
};
exports.ChatController = ChatController;
__decorate([
    (0, common_1.Get)('rooms'),
    (0, swagger_1.ApiOperation)({
        summary: 'Lấy danh sách các phòng chat của user; với type=CLUB&communityId trả (hoặc lazy-create) phòng chat CLUB của cộng đồng',
    }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [get_club_room_query_dto_1.GetClubRoomQueryDto, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getMyRooms", null);
__decorate([
    (0, common_1.Post)('rooms'),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo phòng chat mới (Direct hoặc Group)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_room_dto_1.CreateRoomDto, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "createRoom", null);
__decorate([
    (0, common_1.Post)('messages'),
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(60, 60000)),
    (0, swagger_1.ApiOperation)({ summary: 'Gửi tin nhắn vào phòng' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_message_dto_1.CreateMessageDto, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "sendMessage", null);
__decorate([
    (0, common_1.Get)('rooms/:id/messages'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy lịch sử tin nhắn của một phòng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, query_chat_messages_dto_1.QueryChatMessagesDto, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Put)('rooms/:id/read'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "markRoomRead", null);
__decorate([
    (0, common_1.Post)('rooms/:id/clear'),
    (0, swagger_1.ApiOperation)({ summary: 'Xóa lịch sử đoạn chat phía người dùng' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "clearRoom", null);
__decorate([
    (0, common_1.Get)('rooms/:id/unread'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getUnreadCount", null);
__decorate([
    (0, common_1.Get)('support/me'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy cuộc hội thoại hỗ trợ của người dùng hiện tại' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getMySupportConversation", null);
__decorate([
    (0, common_1.Post)('messages/:id/revoke'),
    (0, swagger_1.ApiOperation)({ summary: 'Thu hồi tin nhắn' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "revokeMessage", null);
__decorate([
    (0, common_1.Post)('rooms/:roomId/messages/:id/pin'),
    (0, swagger_1.ApiOperation)({ summary: 'Ghim tin nhắn lên đầu phòng chat' }),
    __param(0, (0, common_1.Param)('roomId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "pinMessage", null);
__decorate([
    (0, common_1.Delete)('rooms/:roomId/messages/:id/pin'),
    (0, swagger_1.ApiOperation)({ summary: 'Bỏ ghim tin nhắn' }),
    __param(0, (0, common_1.Param)('roomId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "unpinMessage", null);
__decorate([
    (0, common_1.Get)('rooms/:roomId/pinned'),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy tin nhắn đang được ghim trong phòng' }),
    __param(0, (0, common_1.Param)('roomId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getPinnedMessage", null);
__decorate([
    (0, common_1.Post)('messages/:id/reaction'),
    (0, swagger_1.ApiOperation)({ summary: 'Thả hoặc bỏ cảm xúc cho tin nhắn' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "toggleReaction", null);
__decorate([
    (0, common_1.Post)('messages/:id/poll/vote'),
    (0, swagger_1.ApiOperation)({ summary: 'Bình chọn cho một lựa chọn trong Poll' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "votePoll", null);
__decorate([
    (0, common_1.Get)('link-preview'),
    (0, swagger_1.ApiOperation)({ summary: 'Trích xuất thông tin xem trước của liên kết (OpenGraph preview)' }),
    __param(0, (0, common_1.Query)('url')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getLinkPreview", null);
__decorate([
    (0, common_1.Put)('rooms/:roomId/settings'),
    (0, swagger_1.ApiOperation)({ summary: 'Cập nhật cài đặt phòng chat CLB' }),
    __param(0, (0, common_1.Param)('roomId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "updateClubRoomSettings", null);
__decorate([
    (0, common_1.Get)('blocks'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getBlockedUsers", null);
__decorate([
    (0, common_1.Post)('blocks/:userId'),
    __param(0, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "blockUser", null);
__decorate([
    (0, common_1.Delete)('blocks/:userId'),
    __param(0, (0, common_1.Param)('userId', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "unblockUser", null);
__decorate([
    (0, common_1.Post)('support'),
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(30, 60000)),
    (0, swagger_1.ApiOperation)({ summary: 'Mở cuộc hội thoại và gửi tin nhắn cho admin' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_support_conversation_dto_1.CreateSupportConversationDto, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "openSupportConversation", null);
__decorate([
    (0, common_1.Get)('admin/support/rooms'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Danh sách hội thoại hỗ trợ dành cho admin' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getAdminSupportRooms", null);
__decorate([
    (0, common_1.Get)('admin/support/rooms/:id/messages'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Đọc hội thoại hỗ trợ dành cho admin' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "getAdminSupportMessages", null);
__decorate([
    (0, common_1.Post)('admin/support/rooms/:id/read'),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Mark user support messages as read' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "markAdminSupportRoomRead", null);
__decorate([
    (0, common_1.Post)('admin/support/rooms/:id/messages'),
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(60, 60000)),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN, enums_1.UserRole.MODERATOR),
    (0, swagger_1.ApiOperation)({ summary: 'Admin trả lời hội thoại hỗ trợ' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, send_support_message_dto_1.SendSupportMessageDto, Object]),
    __metadata("design:returntype", Promise)
], ChatController.prototype, "sendAdminSupportMessage", null);
exports.ChatController = ChatController = __decorate([
    (0, swagger_1.ApiTags)('chat'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('chat'),
    __metadata("design:paramtypes", [chat_service_1.ChatService])
], ChatController);
//# sourceMappingURL=chat.controller.js.map