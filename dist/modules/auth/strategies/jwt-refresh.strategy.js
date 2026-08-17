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
exports.JwtRefreshStrategy = void 0;
const passport_jwt_1 = require("passport-jwt");
const passport_1 = require("@nestjs/passport");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const extractRefreshToken = (request) => {
    if (!request)
        return null;
    const headerToken = request.headers['x-refresh-token'];
    if (headerToken && typeof headerToken === 'string') {
        return headerToken;
    }
    if (request.body && request.body.refreshToken) {
        return request.body.refreshToken;
    }
    return request.cookies?.refreshToken || null;
};
let JwtRefreshStrategy = class JwtRefreshStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy, 'jwt-refresh') {
    configService;
    constructor(configService) {
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromExtractors([
                (request) => extractRefreshToken(request),
            ]),
            ignoreExpiration: false,
            secretOrKey: configService.get('auth.jwtRefreshSecret'),
            passReqToCallback: true,
        });
        this.configService = configService;
    }
    validate(req, payload) {
        const refreshToken = extractRefreshToken(req);
        if (!refreshToken) {
            throw new common_1.UnauthorizedException('Refresh token malformed');
        }
        return {
            ...payload,
            refreshToken,
        };
    }
};
exports.JwtRefreshStrategy = JwtRefreshStrategy;
exports.JwtRefreshStrategy = JwtRefreshStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], JwtRefreshStrategy);
//# sourceMappingURL=jwt-refresh.strategy.js.map