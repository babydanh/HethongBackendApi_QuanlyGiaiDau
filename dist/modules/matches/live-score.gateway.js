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
var LiveScoreGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveScoreGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const cors_config_1 = require("../../config/cors.config");
const perf_hooks_1 = require("perf_hooks");
let LiveScoreGateway = LiveScoreGateway_1 = class LiveScoreGateway {
    server;
    logger = new common_1.Logger(LiveScoreGateway_1.name);
    clientMatchRooms = new Map();
    clientTournamentRooms = new Map();
    pendingViewerUpdates = new Set();
    batchInterval = null;
    viewerSyncInterval = null;
    metricsInterval = null;
    loopMonitor = (0, perf_hooks_1.monitorEventLoopDelay)({ resolution: 20 });
    constructor() {
        this.loopMonitor.enable();
        this.batchInterval = setInterval(() => {
            this.flushViewerCounts();
        }, 1000);
        this.viewerSyncInterval = setInterval(() => {
            this.broadcastAllViewerCounts();
        }, 5000);
        this.metricsInterval = setInterval(() => {
            this.broadcastSystemMetrics();
        }, 2000);
    }
    onApplicationShutdown() {
        if (this.batchInterval) {
            clearInterval(this.batchInterval);
        }
        if (this.viewerSyncInterval) {
            clearInterval(this.viewerSyncInterval);
        }
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
        this.loopMonitor.disable();
    }
    handleConnection(client) {
        this.logger.log(`Client connected: ${client.id}`);
        setTimeout(() => {
            if (client.connected) {
                const joinedRooms = this.clientMatchRooms.get(client.id);
                const joinedTournamentRooms = this.clientTournamentRooms.get(client.id);
                if ((!joinedRooms || joinedRooms.size === 0) &&
                    (!joinedTournamentRooms || joinedTournamentRooms.size === 0)) {
                    this.logger.warn(`Disconnecting zombie client ${client.id} due to inactivity (not joined any match).`);
                    client.disconnect(true);
                }
            }
        }, 30000);
    }
    handleDisconnect(client) {
        const joinedMatchIds = this.clientMatchRooms.get(client.id);
        if (joinedMatchIds) {
            joinedMatchIds.forEach((matchId) => {
                this.pendingViewerUpdates.add(matchId);
            });
            this.clientMatchRooms.delete(client.id);
        }
        this.clientTournamentRooms.delete(client.id);
        this.logger.log(`Client disconnected: ${client.id}`);
    }
    getViewerCount(matchId) {
        const roomName = `match:${matchId}`;
        const adapterRoom = this.server?.sockets?.adapter?.rooms?.get(roomName);
        if (adapterRoom && adapterRoom.size > 0) {
            return adapterRoom.size;
        }
        let count = 0;
        this.clientMatchRooms.forEach((matches) => {
            if (matches.has(matchId)) {
                count++;
            }
        });
        return count;
    }
    handleJoinMatch(matchId, client) {
        const room = `match:${matchId}`;
        client.join(room);
        const joinedMatchIds = this.clientMatchRooms.get(client.id) ?? new Set();
        joinedMatchIds.add(matchId);
        this.clientMatchRooms.set(client.id, joinedMatchIds);
        const viewerCount = this.getViewerCount(matchId);
        const payload = JSON.stringify({ matchId, viewerCount });
        client.emit('viewer:count', payload);
        this.server.to(room).emit('viewer:count', payload);
        this.logger.log(`Client ${client.id} joined room ${room} (viewers: ${viewerCount})`);
        return { event: 'joined', data: room };
    }
    handleLeaveMatch(matchId, client) {
        const room = `match:${matchId}`;
        client.leave(room);
        const joinedMatchIds = this.clientMatchRooms.get(client.id);
        if (joinedMatchIds) {
            joinedMatchIds.delete(matchId);
            if (joinedMatchIds.size === 0) {
                this.clientMatchRooms.delete(client.id);
            }
            else {
                this.clientMatchRooms.set(client.id, joinedMatchIds);
            }
        }
        this.pendingViewerUpdates.add(matchId);
        this.logger.log(`Client ${client.id} left room ${room}`);
        return { event: 'left', data: room };
    }
    handleJoinTournament(tournamentId, client) {
        const room = `tournament:${tournamentId}`;
        client.join(room);
        const joinedTournamentIds = this.clientTournamentRooms.get(client.id) ?? new Set();
        joinedTournamentIds.add(tournamentId);
        this.clientTournamentRooms.set(client.id, joinedTournamentIds);
        return { event: 'joined', data: room };
    }
    handleLeaveTournament(tournamentId, client) {
        const room = `tournament:${tournamentId}`;
        client.leave(room);
        const joinedTournamentIds = this.clientTournamentRooms.get(client.id);
        if (joinedTournamentIds) {
            joinedTournamentIds.delete(tournamentId);
            if (joinedTournamentIds.size === 0) {
                this.clientTournamentRooms.delete(client.id);
            }
        }
        return { event: 'left', data: room };
    }
    broadcastScoreUpdate(matchId, matchData, tournamentId) {
        if (!this.server)
            return;
        const rawPayload = JSON.stringify(matchData);
        this.server.to(`match:${matchId}`).emit('score:update', rawPayload);
        if (tournamentId) {
            this.server.to(`tournament:${tournamentId}`).emit('match:update', rawPayload);
        }
    }
    broadcastMatchStatus(matchId, matchData, tournamentId) {
        if (!this.server)
            return;
        const rawPayload = JSON.stringify(matchData);
        this.server.to(`match:${matchId}`).emit('match:status', rawPayload);
        if (tournamentId) {
            this.server.to(`tournament:${tournamentId}`).emit('match:update', rawPayload);
        }
    }
    broadcastRegistrationUpdate(tournamentId, payload) {
        if (!this.server)
            return;
        this.server.to(`tournament:${tournamentId}`).emit('registration:update', JSON.stringify({
            tournamentId,
            ...payload,
            occurredAt: new Date().toISOString(),
        }));
    }
    flushViewerCounts() {
        if (this.pendingViewerUpdates.size === 0 || !this.server)
            return;
        this.pendingViewerUpdates.forEach((matchId) => {
            const room = `match:${matchId}`;
            const viewerCount = this.getViewerCount(matchId);
            const payload = JSON.stringify({ matchId, viewerCount });
            this.server.volatile.to(room).emit('viewer:count', payload);
        });
        this.pendingViewerUpdates.clear();
    }
    broadcastAllViewerCounts() {
        if (!this.server)
            return;
        const counts = new Map();
        this.clientMatchRooms.forEach((matches) => {
            matches.forEach((matchId) => {
                counts.set(matchId, (counts.get(matchId) ?? 0) + 1);
            });
        });
        counts.forEach((viewerCount, matchId) => {
            const payload = JSON.stringify({ matchId, viewerCount });
            this.server.to(`match:${matchId}`).emit('viewer:count', payload);
        });
    }
    broadcastComment(matchId, comment) {
        if (!this.server)
            return;
        const rawPayload = JSON.stringify(comment);
        this.server.to(`match:${matchId}`).emit('comment:new', rawPayload);
    }
    broadcastCheerUpdate(matchId, cheerCount) {
        if (!this.server)
            return;
        const rawPayload = JSON.stringify({ matchId, cheerCount });
        this.server.volatile.to(`match:${matchId}`).emit('cheer:update', rawPayload);
    }
    broadcastSystemMetrics() {
        if (!this.server)
            return;
        const activeConnections = this.server.sockets?.sockets?.size ?? 0;
        const eventLoopLag = parseFloat((this.loopMonitor.mean / 1e6).toFixed(2));
        this.loopMonitor.reset();
        let totalBufferSize = 0;
        this.server.sockets?.sockets?.forEach((socket) => {
            const transport = socket.conn?.transport;
            if (transport && transport.writable === false && transport.writeBuffer) {
                totalBufferSize += transport.writeBuffer.length;
            }
        });
        const payload = JSON.stringify({
            connections: activeConnections,
            eventLoopLag,
            bufferedSize: parseFloat((totalBufferSize / 1024).toFixed(2)),
        });
        this.server.volatile.emit('system:metrics', payload);
    }
};
exports.LiveScoreGateway = LiveScoreGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], LiveScoreGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('joinMatch'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], LiveScoreGateway.prototype, "handleJoinMatch", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leaveMatch'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], LiveScoreGateway.prototype, "handleLeaveMatch", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('joinTournament'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], LiveScoreGateway.prototype, "handleJoinTournament", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leaveTournament'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], LiveScoreGateway.prototype, "handleLeaveTournament", null);
exports.LiveScoreGateway = LiveScoreGateway = LiveScoreGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: cors_config_1.corsOptions,
        namespace: '/live',
        pingInterval: 25000,
        pingTimeout: 10000,
        maxHttpBufferSize: 1e6,
    }),
    __metadata("design:paramtypes", [])
], LiveScoreGateway);
//# sourceMappingURL=live-score.gateway.js.map