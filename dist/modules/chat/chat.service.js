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
exports.ChatService = void 0;
const common_1 = require("@nestjs/common");
const chat_repository_1 = require("./chat.repository");
const chat_gateway_1 = require("./chat.gateway");
const create_room_dto_1 = require("./dto/create-room.dto");
const link_preview_util_1 = require("./utils/link-preview.util");
const firebase_service_1 = require("../firebase/firebase.service");
let ChatService = class ChatService {
    chatRepository;
    chatGateway;
    firebaseService;
    constructor(chatRepository, chatGateway, firebaseService) {
        this.chatRepository = chatRepository;
        this.chatGateway = chatGateway;
        this.firebaseService = firebaseService;
    }
    async getUserRooms(userId) {
        return this.chatRepository.getUserRooms(userId);
    }
    async assertDirectRoomAccess(userId, roomId) {
        if (!(await this.chatRepository.isMemberOfRoom(roomId, userId))) {
            throw new common_1.ForbiddenException('Bạn không có quyền truy cập phòng chat này.');
        }
        const otherUserId = (await this.chatRepository.getRoomMemberIds(roomId))
            .find((memberId) => memberId !== userId);
        if (otherUserId && await this.chatRepository.isBlockedBetween(userId, otherUserId)) {
            throw new common_1.ForbiddenException('Bạn không thể tương tác trong cuộc trò chuyện này vì đã bị chặn.');
        }
    }
    async assertCanDirectMessage(fromUserId, toUserId) {
        if (fromUserId === toUserId)
            return;
        const allowed = await this.chatRepository.getAllowStrangerMessages(toUserId);
        if (allowed)
            return;
        if (await this.chatRepository.isAcquainted(fromUserId, toUserId))
            return;
        throw new common_1.ForbiddenException('Người dùng này không nhận tin nhắn từ người lạ.');
    }
    async createRoom(userId, data) {
        if (data.type === create_room_dto_1.RoomType.SUPPORT) {
            throw new common_1.ForbiddenException('Phòng hỗ trợ chỉ được tạo qua chức năng hỗ trợ trực tiếp.');
        }
        if (data.type === create_room_dto_1.RoomType.CLUB) {
            throw new common_1.ForbiddenException('Phòng CLUB chỉ được tạo tự động qua chức năng chat cộng đồng.');
        }
        const memberIds = Array.from(new Set([...data.memberIds, userId]));
        if (data.type === create_room_dto_1.RoomType.DIRECT && memberIds.length !== 2) {
            throw new common_1.BadRequestException('Direct room must have exactly 2 members');
        }
        if (data.type === create_room_dto_1.RoomType.DIRECT) {
            const otherUserId = memberIds.find((memberId) => memberId !== userId);
            if (!otherUserId || !(await this.chatRepository.isActiveUser(otherUserId))) {
                throw new common_1.NotFoundException('Không tìm thấy người dùng để nhắn tin.');
            }
            if (otherUserId && await this.chatRepository.isBlockedBetween(userId, otherUserId)) {
                throw new common_1.ForbiddenException('Không thể mở chat vì một trong hai người đã chặn nhau.');
            }
            await this.assertCanDirectMessage(userId, otherUserId);
            const room = await this.chatRepository.getOrCreateDirectRoom(userId, otherUserId);
            return (await this.chatRepository.getUserRoomById(userId, room.id)) ?? room;
        }
        return this.chatRepository.createRoomWithMembers({ ...data, memberIds });
    }
    async getOrCreateClubRoom(communityId, userId) {
        await this.assertClubMember(communityId, userId);
        const room = await this.chatRepository.getOrCreateClubRoom(communityId);
        const members = await this.chatRepository.getClubRoomMembers(communityId);
        return { ...room, members };
    }
    async assertClubMember(communityId, userId) {
        if (!(await this.chatRepository.isClubChatEnabled(communityId))) {
            throw new common_1.ForbiddenException('KÃªnh chat cá»§a cá»™ng Ä‘á»“ng hiá»‡n Ä‘ang táº¯t.');
        }
        const member = await this.chatRepository.findCommunityMember(communityId, userId);
        if (!member) {
            throw new common_1.ForbiddenException('You are not a member of this community');
        }
        if (member.status !== 'JOINED') {
            throw new common_1.ForbiddenException('Bạn cần là thành viên chính thức của cộng đồng để tham gia kênh chat.');
        }
        return member;
    }
    async sendMessage(userId, data) {
        const messageText = data.messageText?.trim();
        const attachmentsUrls = (data.attachmentsUrls ?? []).filter((url) => url.trim().length > 0);
        if (!messageText && attachmentsUrls.length === 0) {
            throw new common_1.BadRequestException('Tin nhắn cần có nội dung hoặc ít nhất một tệp đính kèm.');
        }
        const room = await this.chatRepository.findRoomById(data.roomId);
        if (!room) {
            throw new common_1.NotFoundException('Không tìm thấy phòng chat.');
        }
        const roomType = room.type;
        if (roomType === create_room_dto_1.RoomType.CLUB && room.communityId) {
            const role = await this.chatRepository.getCommunityRole(room.communityId, userId);
            if (!role) {
                throw new common_1.ForbiddenException('Bạn phải là thành viên của CLB để gửi tin nhắn.');
            }
            if (room.isAnnouncementOnly && role !== 'OWNER' && role !== 'ADMIN' && role !== 'MODERATOR') {
                throw new common_1.ForbiddenException('Phòng chat đang ở chế độ Chỉ Ban Quản Trị được nhắn tin.');
            }
            if (room.slowModeSeconds && room.slowModeSeconds > 0 && role !== 'OWNER' && role !== 'ADMIN' && role !== 'MODERATOR') {
                const lastUserMsg = await this.chatRepository.getLastUserMessageInRoom(data.roomId, userId);
                if (lastUserMsg && lastUserMsg.createdAt) {
                    const elapsed = (Date.now() - new Date(lastUserMsg.createdAt).getTime()) / 1000;
                    if (elapsed < room.slowModeSeconds) {
                        const waitTime = Math.ceil(room.slowModeSeconds - elapsed);
                        throw new common_1.BadRequestException(`Chế độ làm chậm đang bật. Vui lòng chờ ${waitTime} giây trước khi gửi tiếp.`);
                    }
                }
            }
        }
        else {
            const isMember = await this.chatRepository.isMemberOfRoom(data.roomId, userId);
            if (!isMember) {
                throw new common_1.ForbiddenException('You are not a member of this chat room');
            }
        }
        if (roomType === create_room_dto_1.RoomType.DIRECT) {
            const otherUserId = (await this.chatRepository.getRoomMemberIds(data.roomId))
                .find((memberId) => memberId !== userId);
            if (otherUserId && await this.chatRepository.isBlockedBetween(userId, otherUserId)) {
                throw new common_1.ForbiddenException('Không thể gửi tin nhắn vì một trong hai người đã chặn nhau.');
            }
            if (otherUserId) {
                await this.assertCanDirectMessage(userId, otherUserId);
            }
        }
        const message = await this.chatRepository.saveMessage(userId, {
            ...data,
            messageText,
            attachmentsUrls,
        });
        if (roomType === create_room_dto_1.RoomType.SUPPORT) {
            this.chatGateway.broadcastSupportMessage(data.roomId, message);
        }
        else if (roomType === create_room_dto_1.RoomType.CLUB && room.communityId) {
            const senderTags = await this.chatRepository.getMemberTags(room.communityId, userId);
            const clubPayload = {
                ...message,
                senderTags,
            };
            this.chatGateway.broadcastClubMessage(data.roomId, clubPayload);
            this.chatGateway.broadcastMessage(data.roomId, clubPayload);
        }
        else {
            this.chatGateway.broadcastMessage(data.roomId, message);
        }
        void (async () => {
            try {
                let recipientIds = [];
                if (roomType === create_room_dto_1.RoomType.DIRECT || roomType === create_room_dto_1.RoomType.SUPPORT) {
                    const members = await this.chatRepository.getRoomMemberIds(data.roomId);
                    recipientIds = members.filter((m) => m !== userId);
                }
                else if (roomType === create_room_dto_1.RoomType.CLUB && room.communityId) {
                    const membersWithPref = await this.chatRepository.getCommunityMembersWithNotificationPref(room.communityId, userId);
                    const mentions = data.metadata?.mentions || [];
                    const isMentioned = (uid) => mentions.includes(uid) ||
                        Boolean(messageText && (messageText.includes(`@${uid}`) || messageText.includes('@all') || messageText.includes('@everyone')));
                    recipientIds = membersWithPref
                        .filter((m) => {
                        if (m.notificationPreference === 'MUTED')
                            return false;
                        if (m.notificationPreference === 'MENTIONS_ONLY')
                            return isMentioned(m.userId);
                        return true;
                    })
                        .map((m) => m.userId);
                }
                if (recipientIds.length > 0) {
                    const senderUser = await this.chatRepository.findUserById(userId);
                    const senderName = senderUser?.fullName || 'Một thành viên';
                    const title = room.name ? `${senderName} (${room.name})` : senderName;
                    const body = messageText || (attachmentsUrls.length > 0 ? '📷 Đã gửi hình ảnh' : 'Tin nhắn mới');
                    await this.firebaseService.sendPushToUsers(recipientIds, {
                        title,
                        body,
                        data: {
                            type: 'CHAT',
                            roomId: data.roomId,
                            messageId: message.id,
                        },
                    });
                }
            }
            catch {
            }
        })();
        return message;
    }
    async getMessages(userId, roomId, limit = 30, cursor) {
        const room = await this.chatRepository.findRoomById(roomId);
        if (!room) {
            throw new common_1.NotFoundException('Không tìm thấy phòng chat.');
        }
        const roomType = room.type;
        if (roomType === create_room_dto_1.RoomType.CLUB && room.communityId) {
            await this.assertClubMember(room.communityId, userId);
        }
        else {
            const isMember = await this.chatRepository.isMemberOfRoom(roomId, userId);
            if (!isMember) {
                throw new common_1.ForbiddenException('You are not a member of this chat room');
            }
            if (roomType === create_room_dto_1.RoomType.DIRECT) {
                const otherUserId = (await this.chatRepository.getRoomMemberIds(roomId))
                    .find((memberId) => memberId !== userId);
                if (otherUserId && await this.chatRepository.isBlockedBetween(userId, otherUserId)) {
                    throw new common_1.ForbiddenException('Bạn không thể truy cập cuộc trò chuyện này vì đã bị chặn.');
                }
            }
        }
        return this.chatRepository.getMessagesPage(roomId, limit, cursor, userId);
    }
    async clearRoomMessages(userId, roomId) {
        const room = await this.chatRepository.findRoomById(roomId);
        if (!room) {
            throw new common_1.NotFoundException('Không tìm thấy phòng chat.');
        }
        const roomType = room.type;
        if (roomType === create_room_dto_1.RoomType.CLUB && room.communityId) {
            await this.assertClubMember(room.communityId, userId);
        }
        else {
            const isMember = await this.chatRepository.isMemberOfRoom(roomId, userId);
            if (!isMember) {
                throw new common_1.ForbiddenException('Bạn không phải là thành viên của phòng chat này.');
            }
        }
        return await this.chatRepository.clearRoomHistory(userId, roomId);
    }
    async revokeMessage(userId, messageId) {
        const message = await this.chatRepository.findMessageById(messageId);
        if (!message) {
            throw new common_1.NotFoundException('Không tìm thấy tin nhắn.');
        }
        if (message.isRevoked) {
            return message;
        }
        const room = await this.chatRepository.findRoomById(message.roomId);
        if (!room) {
            throw new common_1.NotFoundException('Không tìm thấy phòng chat.');
        }
        let isAllowed = message.senderId === userId;
        const roomType = room.type;
        if (!isAllowed && roomType === create_room_dto_1.RoomType.CLUB && room.communityId) {
            const role = await this.chatRepository.getCommunityRole(room.communityId, userId);
            isAllowed = role === 'OWNER' || role === 'ADMIN' || role === 'MODERATOR';
        }
        if (!isAllowed) {
            throw new common_1.ForbiddenException('Bạn không có quyền thu hồi tin nhắn này.');
        }
        const updated = await this.chatRepository.revokeMessage(messageId, userId);
        this.chatGateway.broadcastMessageRevoked(message.roomId, messageId, userId);
        return updated;
    }
    async pinMessage(userId, roomId, messageId) {
        const room = await this.chatRepository.findRoomById(roomId);
        if (!room)
            throw new common_1.NotFoundException('Không tìm thấy phòng chat.');
        const message = await this.chatRepository.findMessageById(messageId);
        if (!message || message.roomId !== roomId) {
            throw new common_1.NotFoundException('Tin nhắn không thuộc phòng chat này.');
        }
        const roomType = room.type;
        if (roomType === create_room_dto_1.RoomType.CLUB && room.communityId) {
            const role = await this.chatRepository.getCommunityRole(room.communityId, userId);
            if (role !== 'OWNER' && role !== 'ADMIN' && role !== 'MODERATOR') {
                throw new common_1.ForbiddenException('Chỉ Ban Quản Trị mới có quyền ghim tin nhắn.');
            }
        }
        else if (roomType === create_room_dto_1.RoomType.DIRECT) {
            await this.assertDirectRoomAccess(userId, roomId);
        }
        else if (!(await this.chatRepository.isMemberOfRoom(roomId, userId))) {
            throw new common_1.ForbiddenException('Bạn không có quyền ghim tin nhắn trong phòng này.');
        }
        const res = await this.chatRepository.pinMessage(roomId, messageId, userId);
        const pinnedMsg = await this.chatRepository.getPinnedMessage(roomId);
        this.chatGateway.broadcastMessagePinned(roomId, messageId, userId, pinnedMsg);
        return res;
    }
    async unpinMessage(userId, roomId, messageId) {
        const room = await this.chatRepository.findRoomById(roomId);
        if (!room)
            throw new common_1.NotFoundException('Không tìm thấy phòng chat.');
        const message = await this.chatRepository.findMessageById(messageId);
        if (!message || message.roomId !== roomId) {
            throw new common_1.NotFoundException('Tin nhắn không thuộc phòng chat này.');
        }
        const roomType = room.type;
        if (roomType === create_room_dto_1.RoomType.CLUB && room.communityId) {
            const role = await this.chatRepository.getCommunityRole(room.communityId, userId);
            if (role !== 'OWNER' && role !== 'ADMIN' && role !== 'MODERATOR') {
                throw new common_1.ForbiddenException('Chỉ Ban Quản Trị mới có quyền bỏ ghim tin nhắn.');
            }
        }
        else if (roomType === create_room_dto_1.RoomType.DIRECT) {
            await this.assertDirectRoomAccess(userId, roomId);
        }
        else if (!(await this.chatRepository.isMemberOfRoom(roomId, userId))) {
            throw new common_1.ForbiddenException('Bạn không có quyền bỏ ghim tin nhắn trong phòng này.');
        }
        const res = await this.chatRepository.unpinMessage(roomId, messageId);
        this.chatGateway.broadcastMessageUnpinned(roomId, messageId, userId);
        return res;
    }
    async getPinnedMessage(userId, roomId) {
        const room = await this.chatRepository.findRoomById(roomId);
        if (!room)
            throw new common_1.NotFoundException('Không tìm thấy phòng chat.');
        const roomType = room.type;
        if (roomType === create_room_dto_1.RoomType.CLUB && room.communityId) {
            await this.assertClubMember(room.communityId, userId);
        }
        else if (roomType === create_room_dto_1.RoomType.DIRECT) {
            await this.assertDirectRoomAccess(userId, roomId);
        }
        else if (!(await this.chatRepository.isMemberOfRoom(roomId, userId))) {
            throw new common_1.ForbiddenException('Bạn không có quyền xem tin nhắn được ghim.');
        }
        return this.chatRepository.getPinnedMessage(roomId);
    }
    async toggleReaction(userId, messageId, emoji) {
        const message = await this.chatRepository.findMessageById(messageId);
        if (!message)
            throw new common_1.NotFoundException('Không tìm thấy tin nhắn.');
        const room = await this.chatRepository.findRoomById(message.roomId);
        if (!room)
            throw new common_1.NotFoundException('Không tìm thấy phòng chat.');
        const roomType = room.type;
        if (roomType === create_room_dto_1.RoomType.CLUB && room.communityId) {
            await this.assertClubMember(room.communityId, userId);
        }
        else if (roomType === create_room_dto_1.RoomType.DIRECT) {
            await this.assertDirectRoomAccess(userId, message.roomId);
        }
        else if (!(await this.chatRepository.isMemberOfRoom(message.roomId, userId))) {
            throw new common_1.ForbiddenException('Bạn không có quyền thả cảm xúc trong phòng này.');
        }
        const reactions = await this.chatRepository.toggleReaction(messageId, userId, emoji);
        this.chatGateway.broadcastMessageReaction(message.roomId, messageId, userId, emoji, reactions);
        return { reactions };
    }
    async updateClubRoomSettings(userId, roomId, data) {
        const room = await this.chatRepository.findRoomById(roomId);
        const roomType = room?.type;
        if (!room || roomType !== create_room_dto_1.RoomType.CLUB || !room.communityId) {
            throw new common_1.NotFoundException('Phòng chat CLB không tồn tại.');
        }
        const role = await this.chatRepository.getCommunityRole(room.communityId, userId);
        if (role !== 'OWNER' && role !== 'ADMIN') {
            throw new common_1.ForbiddenException('Chỉ Chủ nhiệm hoặc Quản trị viên mới có thể đổi cài đặt phòng chat.');
        }
        const updated = await this.chatRepository.updateClubRoomSettings(roomId, data);
        this.chatGateway.broadcastRoomUpdated(roomId, updated);
        return updated;
    }
    async markRoomRead(userId, roomId) {
        await this.getMessages(userId, roomId, 1);
        const state = await this.chatRepository.markRead(roomId, userId);
        const readAt = state?.lastReadAt ? new Date(state.lastReadAt).toISOString() : new Date().toISOString();
        this.chatGateway.broadcastRoomRead(roomId, userId, readAt);
        return state;
    }
    async getUnreadCount(userId, roomId) {
        await this.getMessages(userId, roomId, 1);
        return { count: await this.chatRepository.countUnreadUsingState(roomId, userId) };
    }
    async blockUser(blockerId, blockedId) {
        if (blockerId === blockedId)
            throw new common_1.BadRequestException('Không thể tự chặn chính mình.');
        if (!(await this.chatRepository.isActiveUser(blockedId))) {
            throw new common_1.NotFoundException('Không tìm thấy người dùng để chặn.');
        }
        return this.chatRepository.createBlock(blockerId, blockedId);
    }
    async unblockUser(blockerId, blockedId) {
        return { success: await this.chatRepository.deleteBlock(blockerId, blockedId) };
    }
    async getBlockedUsers(blockerId) {
        return this.chatRepository.getBlocks(blockerId);
    }
    async getMySupportConversation(userId) {
        const room = await this.chatRepository.findSupportRoomForUser(userId);
        if (!room)
            return null;
        return {
            ...room,
            messages: await this.chatRepository.getMessagesByRoom(room.id),
        };
    }
    async openSupportConversation(userId, data) {
        let room = await this.chatRepository.findSupportRoomForUser(userId);
        if (!room) {
            room = await this.chatRepository.createRoomWithMembers({
                name: 'Hỗ trợ người dùng',
                type: create_room_dto_1.RoomType.SUPPORT,
                memberIds: [userId],
            });
        }
        const messageText = data.messageText?.trim();
        if (messageText) {
            const message = await this.chatRepository.saveMessage(userId, {
                roomId: room.id,
                messageText,
            });
            this.chatGateway.broadcastSupportMessage(room.id, message);
        }
        return {
            ...room,
            messages: await this.chatRepository.getMessagesByRoom(room.id),
        };
    }
    async getAdminSupportRooms() {
        return this.chatRepository.getSupportRooms();
    }
    async getAdminSupportMessages(roomId) {
        await this.ensureSupportRoom(roomId);
        return this.chatRepository.getMessagesByRoom(roomId);
    }
    async markAdminSupportRoomRead(roomId) {
        await this.ensureSupportRoom(roomId);
        await this.chatRepository.markSupportRoomRead(roomId);
        this.chatGateway.broadcastSupportRead(roomId);
        return { success: true };
    }
    async sendAdminSupportMessage(adminId, roomId, messageText) {
        await this.ensureSupportRoom(roomId);
        const content = messageText.trim();
        if (!content) {
            throw new common_1.BadRequestException('Nội dung tin nhắn không được để trống.');
        }
        const message = await this.chatRepository.saveMessage(adminId, {
            roomId,
            messageText: content,
        });
        this.chatGateway.broadcastSupportMessage(roomId, message);
        return message;
    }
    async votePoll(userId, messageId, optionId) {
        const result = await this.chatRepository.votePoll(userId, messageId, optionId);
        this.chatGateway.broadcastPollVoted(result.roomId, result.messageId, result.metadata);
        return result;
    }
    async getLinkPreview(url) {
        if (!url) {
            throw new common_1.BadRequestException('URL không được để trống.');
        }
        const preview = await (0, link_preview_util_1.extractLinkPreview)(url);
        return { data: preview };
    }
    async ensureSupportRoom(roomId) {
        const room = await this.chatRepository.findRoomById(roomId);
        const roomType = room?.type;
        if (!room || roomType !== create_room_dto_1.RoomType.SUPPORT) {
            throw new common_1.NotFoundException('Không tìm thấy cuộc hội thoại hỗ trợ.');
        }
        return room;
    }
};
exports.ChatService = ChatService;
exports.ChatService = ChatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [chat_repository_1.ChatRepository,
        chat_gateway_1.ChatGateway,
        firebase_service_1.FirebaseService])
], ChatService);
//# sourceMappingURL=chat.service.js.map