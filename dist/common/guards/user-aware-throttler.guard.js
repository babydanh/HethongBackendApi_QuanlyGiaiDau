"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserAwareThrottlerGuard = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const jwt = __importStar(require("jsonwebtoken"));
let UserAwareThrottlerGuard = class UserAwareThrottlerGuard extends throttler_1.ThrottlerGuard {
    async shouldSkip(context) {
        const type = context.getType();
        if (type === 'ws')
            return true;
        const req = context.switchToHttp().getRequest();
        if (req?.url?.includes('/socket.io/'))
            return true;
        return super.shouldSkip(context);
    }
    getTracker(req) {
        const authenticatedUserId = req.user?.sub || req.user?.id;
        if (authenticatedUserId)
            return Promise.resolve(`user:${authenticatedUserId}`);
        const authorization = req.headers?.authorization;
        if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
            const payload = jwt.decode(authorization.slice(7));
            const tokenUserId = payload?.sub || payload?.id;
            if (tokenUserId)
                return Promise.resolve(`user:${tokenUserId}`);
        }
        const forwardedFor = req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'];
        const clientIp = Array.isArray(forwardedFor)
            ? forwardedFor[0]
            : typeof forwardedFor === 'string'
                ? forwardedFor.split(',')[0].trim()
                : req.ip || req.socket?.remoteAddress || 'unknown';
        return Promise.resolve(`ip:${clientIp}`);
    }
};
exports.UserAwareThrottlerGuard = UserAwareThrottlerGuard;
exports.UserAwareThrottlerGuard = UserAwareThrottlerGuard = __decorate([
    (0, common_1.Injectable)()
], UserAwareThrottlerGuard);
//# sourceMappingURL=user-aware-throttler.guard.js.map