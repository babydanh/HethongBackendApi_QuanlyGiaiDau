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
exports.WsJwtGuard = void 0;
exports.extractWsToken = extractWsToken;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const websockets_1 = require("@nestjs/websockets");
function extractWsToken(client) {
    let token = client.handshake.auth?.token;
    if (typeof token === 'string' && token.trim()) {
        return token.trim().replace(/^Bearer\s+/i, '').trim();
    }
    if (client.handshake.headers.cookie) {
        const cookies = client.handshake.headers.cookie.split(';').reduce((acc, cookie) => {
            const parts = cookie.split('=');
            const key = parts[0]?.trim();
            const value = parts.slice(1).join('=')?.trim();
            if (key && value)
                acc[key] = decodeURIComponent(value);
            return acc;
        }, {});
        if (cookies.accessToken)
            return cookies.accessToken;
    }
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
        return queryToken.trim().replace(/^Bearer\s+/i, '').trim();
    }
    const authorization = client.handshake.headers.authorization;
    if (typeof authorization === 'string' && authorization.trim()) {
        return authorization.trim().replace(/^Bearer\s+/i, '').trim();
    }
    return null;
}
let WsJwtGuard = class WsJwtGuard {
    jwtService;
    constructor(jwtService) {
        this.jwtService = jwtService;
    }
    async canActivate(context) {
        try {
            const client = context.switchToWs().getClient();
            const token = extractWsToken(client);
            if (!token) {
                throw new websockets_1.WsException('Unauthorized');
            }
            const payload = this.jwtService.verify(token);
            client.data.user = payload;
            return true;
        }
        catch (err) {
            throw new websockets_1.WsException('Invalid token');
        }
    }
};
exports.WsJwtGuard = WsJwtGuard;
exports.WsJwtGuard = WsJwtGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService])
], WsJwtGuard);
//# sourceMappingURL=ws-jwt.guard.js.map