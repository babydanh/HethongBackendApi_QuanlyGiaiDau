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
exports.RateLimitGuard = void 0;
const common_1 = require("@nestjs/common");
let RateLimitGuard = class RateLimitGuard {
    store = new Map();
    maxRequests;
    windowMs;
    constructor(maxRequests = 10, windowMs = 60000, forceLimit = false) {
        const env = (process.env.NODE_ENV || 'development').toLowerCase();
        this.maxRequests = (env === 'production' || forceLimit) ? maxRequests : 100000;
        this.windowMs = windowMs;
    }
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const authenticatedUserId = request.user?.sub || request.user?.id;
        const clientAddress = (request.ip || request.ips?.[0]) || 'unknown';
        const key = authenticatedUserId
            ? `user:${authenticatedUserId}`
            : `ip:${clientAddress}`;
        const now = Date.now();
        const entry = this.store.get(key);
        if (!entry || now > entry.resetAt) {
            this.store.set(key, { count: 1, resetAt: now + this.windowMs });
            response.setHeader('X-RateLimit-Limit', this.maxRequests.toString());
            response.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - 1).toString());
            return true;
        }
        if (entry.count >= this.maxRequests) {
            const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
            response.setHeader('Retry-After', retryAfterSeconds.toString());
            response.setHeader('X-RateLimit-Limit', this.maxRequests.toString());
            response.setHeader('X-RateLimit-Remaining', '0');
            throw new common_1.HttpException('Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại.', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        entry.count++;
        response.setHeader('X-RateLimit-Limit', this.maxRequests.toString());
        response.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - entry.count).toString());
        return true;
    }
};
exports.RateLimitGuard = RateLimitGuard;
exports.RateLimitGuard = RateLimitGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Object, Object, Object])
], RateLimitGuard);
//# sourceMappingURL=rate-limit.guard.js.map