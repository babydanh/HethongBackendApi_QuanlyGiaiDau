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
var ChatGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const ws_jwt_guard_1 = require("../../common/guards/ws-jwt.guard");
const jwt_1 = require("@nestjs/jwt");
const send_chat_message_dto_1 = require("./dto/send-chat-message.dto");
const cors_config_1 = require("../../config/cors.config");
const enums_1 = require("../../common/constants/enums");
const role_helper_1 = require("../../common/helpers/role.helper");
const chat_repository_1 = require("./chat.repository");
let ChatGateway = class ChatGateway {
    static { ChatGateway_1 = this; }
    chatRepository;
    jwtService;
    supportStaffRoom = 'support:staff';
    static onlineUsers = new Map();
    constructor(chatRepository, jwtService) {
        this.chatRepository = chatRepository;
        this.jwtService = jwtService;
    }
    server;
    async handleConnection(client) {
        try {
            const token = (0, ws_jwt_guard_1.extractWsToken)(client);
            if (token) {
                const payload = this.jwtService.verify(token);
                if (payload?.sub) {
                    client.data.user = payload;
                    const sockets = ChatGateway_1.onlineUsers.get(payload.sub) || new Set();
                    const wasOffline = sockets.size === 0;
                    sockets.add(client.id);
                    ChatGateway_1.onlineUsers.set(payload.sub, sockets);
                    if (wasOffline) {
                        this.server.emit('chat:user:status', { userId: payload.sub, isOnline: true });
                    }
                }
            }
        }
        catch {
        }
    }
    handleDisconnect(client) {
        const user = client.data.user;
        if (user?.sub) {
            const sockets = ChatGateway_1.onlineUsers.get(user.sub);
            if (sockets) {
                sockets.delete(client.id);
                if (sockets.size === 0) {
                    ChatGateway_1.onlineUsers.delete(user.sub);
                    this.server.emit('chat:user:status', {
                        userId: user.sub,
                        isOnline: false,
                        lastActiveAt: new Date().toISOString(),
                    });
                }
            }
        }
    }
    handleCheckOnlineUsers(userIds) {
        if (!Array.isArray(userIds))
            return {};
        const result = {};
        for (const id of userIds) {
            result[id] = ChatGateway_1.onlineUsers.has(id);
        }
        return result;
    }
    async handleJoinRoom(payload, client) {
        const roomId = typeof payload === 'object' && payload && 'roomId' in payload
            ? payload.roomId
            : String(payload || '');
        if (!roomId) {
            return { event: 'chat:error', data: 'Invalid roomId' };
        }
        let user = client.data.user;
        if (!user?.sub) {
            const token = (0, ws_jwt_guard_1.extractWsToken)(client);
            if (token) {
                try {
                    user = this.jwtService.verify(token);
                    client.data.user = user;
                }
                catch {
                }
            }
        }
        const isSupportStaff = (0, role_helper_1.hasRole)(user, enums_1.UserRole.ADMIN) || (0, role_helper_1.hasRole)(user, enums_1.UserRole.MODERATOR);
        const isMember = user?.sub
            ? await this.chatRepository.canAccessRoom(roomId, user.sub)
            : false;
        const roomRecord = !isMember && isSupportStaff
            ? await this.chatRepository.findRoomById(roomId)
            : null;
        if (!isMember && (!roomRecord || roomRecord.type !== 'SUPPORT')) {
            return { event: 'chat:error', data: 'Forbidden' };
        }
        const room = `chat:${roomId}`;
        client.join(room);
        return { event: 'joined', data: room };
    }
    handleLeaveRoom(roomId, client) {
        const room = `chat:${roomId}`;
        client.leave(room);
        return { event: 'left', data: room };
    }
    handleSubscribeSupportInbox(client) {
        const user = client.data.user;
        const canManageSupport = (0, role_helper_1.hasRole)(user, enums_1.UserRole.ADMIN) || (0, role_helper_1.hasRole)(user, enums_1.UserRole.MODERATOR);
        if (!canManageSupport) {
            return { event: 'support:error', data: 'Forbidden' };
        }
        client.join(this.supportStaffRoom);
        return { event: 'support:subscribed', data: this.supportStaffRoom };
    }
    async handleSubscribeMySupport(client) {
        const user = client.data.user;
        if (!user?.sub) {
            return { event: 'support:error', data: 'Unauthorized' };
        }
        const supportRoom = await this.chatRepository.findSupportRoomForUser(user.sub);
        if (!supportRoom) {
            return { event: 'support:subscribed', data: null };
        }
        const room = `chat:${supportRoom.id}`;
        client.join(room);
        return {
            event: 'support:subscribed',
            data: { roomId: supportRoom.id, room },
        };
    }
    handleMessage(payload, client) {
        return this.persistAndBroadcastMessage(payload, client);
    }
    async persistAndBroadcastMessage(payload, client) {
        const user = client.data.user;
        if (!user?.sub || !payload?.content?.trim())
            return { event: 'chat:error', data: 'Invalid message' };
        const room = await this.chatRepository.findRoomById(payload.roomId);
        const canAccess = await this.chatRepository.canAccessRoom(payload.roomId, user.sub);
        if (!room || !canAccess)
            return { event: 'chat:error', data: 'Forbidden' };
        if (room.type === 'DIRECT') {
            const otherUserId = (await this.chatRepository.getRoomMemberIds(payload.roomId))
                .find((memberId) => memberId !== user.sub);
            if (otherUserId && await this.chatRepository.isBlockedBetween(user.sub, otherUserId)) {
                return { event: 'chat:error', data: 'Blocked' };
            }
            if (otherUserId) {
                const allowStrangers = await this.chatRepository.getAllowStrangerMessages(otherUserId);
                const acquainted = allowStrangers || await this.chatRepository.isAcquainted(user.sub, otherUserId);
                if (!acquainted) {
                    return { event: 'chat:error', data: 'Người dùng này không nhận tin nhắn từ người lạ.' };
                }
            }
        }
        const persisted = await this.chatRepository.saveMessage(user.sub, { roomId: payload.roomId, messageText: payload.content.trim() });
        const messagePayload = { ...persisted, content: persisted.messageText, timestamp: persisted.createdAt.toISOString() };
        if (room.type === 'CLUB')
            this.broadcastClubMessage(payload.roomId, messagePayload);
        else
            this.broadcastMessage(payload.roomId, messagePayload);
        return { event: 'messageSent', data: messagePayload };
    }
    broadcastMessage(roomId, message) {
        this.server.to(`chat:${roomId}`).emit('chat:message', message);
    }
    broadcastClubMessage(roomId, message) {
        this.server.to(`chat:${roomId}`).emit('chat:club:message', message);
    }
    async handleSupportTyping(payload, client) {
        if (!payload?.roomId ||
            typeof payload.isTyping !== 'boolean') {
            return { event: 'support:error', data: 'Invalid typing payload' };
        }
        const user = client.data.user;
        if (!user?.sub) {
            return { event: 'support:error', data: 'Unauthorized' };
        }
        const isSupportStaff = (0, role_helper_1.hasRole)(user, enums_1.UserRole.ADMIN) || (0, role_helper_1.hasRole)(user, enums_1.UserRole.MODERATOR);
        const isMember = await this.chatRepository.isMemberOfRoom(payload.roomId, user.sub);
        const room = !isMember && isSupportStaff
            ? await this.chatRepository.findRoomById(payload.roomId)
            : null;
        if (!isMember && (!room || room.type !== 'SUPPORT')) {
            return { event: 'support:error', data: 'Forbidden' };
        }
        client.to(`chat:${payload.roomId}`).emit('support:typing', {
            roomId: payload.roomId,
            userId: user.sub,
            isTyping: payload.isTyping,
            isSupportStaff,
        });
        return {
            event: 'support:typing:ack',
            data: { roomId: payload.roomId, isTyping: payload.isTyping },
        };
    }
    async handleClubTyping(payload, client) {
        const user = client.data.user;
        if (!user?.sub || !payload?.roomId || typeof payload.isTyping !== 'boolean')
            return { event: 'chat:error', data: 'Invalid typing payload' };
        if (!(await this.chatRepository.canAccessRoom(payload.roomId, user.sub)))
            return { event: 'chat:error', data: 'Forbidden' };
        client.to(`chat:${payload.roomId}`).emit('chat:typing', { roomId: payload.roomId, userId: user.sub, isTyping: payload.isTyping });
        return { event: 'typing:ack', data: payload };
    }
    broadcastSupportMessage(roomId, message) {
        this.broadcastMessage(roomId, message);
        this.server.to(this.supportStaffRoom).emit('support:message', {
            roomId,
            message,
        });
    }
    broadcastSupportRead(roomId) {
        this.server.to(this.supportStaffRoom).emit('support:read', { roomId });
    }
    broadcastMessageRevoked(roomId, messageId, revokedBy) {
        this.server.to(`chat:${roomId}`).emit('chat:message:revoked', { roomId, messageId, revokedBy });
    }
    broadcastMessagePinned(roomId, messageId, pinnedBy, pinnedMessage) {
        this.server.to(`chat:${roomId}`).emit('chat:message:pinned', { roomId, messageId, pinnedBy, pinnedMessage });
    }
    broadcastMessageUnpinned(roomId, messageId, unpinnedBy) {
        this.server.to(`chat:${roomId}`).emit('chat:message:unpinned', { roomId, messageId, unpinnedBy });
    }
    broadcastMessageReaction(roomId, messageId, userId, emoji, reactions) {
        this.server.to(`chat:${roomId}`).emit('chat:message:reaction', { roomId, messageId, userId, emoji, reactions });
    }
    broadcastRoomUpdated(roomId, room) {
        this.server.to(`chat:${roomId}`).emit('chat:room:updated', { roomId, room });
    }
    broadcastPollVoted(roomId, messageId, metadata) {
        this.server.to(`chat:${roomId}`).emit('chat:poll:voted', { roomId, messageId, metadata });
    }
    broadcastRoomRead(roomId, userId, readAt) {
        this.server.to(`chat:${roomId}`).emit('chat:room:read', { roomId, userId, readAt });
    }
};
exports.ChatGateway = ChatGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ChatGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('checkOnlineUsers'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleCheckOnlineUsers", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('joinChatRoom'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleJoinRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leaveChatRoom'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleLeaveRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('subscribeSupportInbox'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleSubscribeSupportInbox", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('subscribeMySupport'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleSubscribeMySupport", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('sendMessage'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [send_chat_message_dto_1.SendChatMessageDto,
        socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], ChatGateway.prototype, "handleMessage", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('supportTyping'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleSupportTyping", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('typing'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleClubTyping", null);
exports.ChatGateway = ChatGateway = ChatGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: cors_config_1.corsOptions,
        namespace: '/chat',
    }),
    (0, common_1.UseGuards)(ws_jwt_guard_1.WsJwtGuard),
    __metadata("design:paramtypes", [chat_repository_1.ChatRepository,
        jwt_1.JwtService])
], ChatGateway);
//# sourceMappingURL=chat.gateway.js.map