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
exports.NotificationsGateway = void 0;
const common_1 = require("@nestjs/common");
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const jwt_1 = require("@nestjs/jwt");
const ws_jwt_guard_1 = require("../../common/guards/ws-jwt.guard");
const ws_jwt_guard_2 = require("../../common/guards/ws-jwt.guard");
const cors_config_1 = require("../../config/cors.config");
let NotificationsGateway = class NotificationsGateway {
    jwtService;
    server;
    constructor(jwtService) {
        this.jwtService = jwtService;
    }
    handleConnection(client) {
        try {
            const token = (0, ws_jwt_guard_2.extractWsToken)(client);
            if (!token)
                throw new websockets_1.WsException('Unauthorized');
            client.data.user = this.jwtService.verify(token);
            const userId = this.getAuthenticatedUserId(client);
            client.join(this.getUserRoom(userId));
        }
        catch (error) {
            client.disconnect();
        }
    }
    handleSubscribe(client) {
        const room = this.getUserRoom(this.getAuthenticatedUserId(client));
        client.join(room);
        return { event: 'subscribed', data: room };
    }
    pushNotification(userId, notification) {
        this.server.to(this.getUserRoom(userId)).emit('notification:new', notification);
    }
    getAuthenticatedUserId(client) {
        const user = client.data.user;
        if (!user?.sub) {
            throw new websockets_1.WsException('Unauthorized');
        }
        return user.sub;
    }
    getUserRoom(userId) {
        return `user:${userId}`;
    }
};
exports.NotificationsGateway = NotificationsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], NotificationsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('subscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], NotificationsGateway.prototype, "handleSubscribe", null);
exports.NotificationsGateway = NotificationsGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: cors_config_1.corsOptions,
        namespace: '/notifications',
    }),
    (0, common_1.UseGuards)(ws_jwt_guard_1.WsJwtGuard),
    __metadata("design:paramtypes", [jwt_1.JwtService])
], NotificationsGateway);
//# sourceMappingURL=notifications.gateway.js.map