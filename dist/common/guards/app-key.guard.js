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
exports.AppKeyGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const skip_app_key_decorator_1 = require("../decorators/skip-app-key.decorator");
const public_decorator_1 = require("../decorators/public.decorator");
let AppKeyGuard = class AppKeyGuard {
    reflector;
    configService;
    constructor(reflector, configService) {
        this.reflector = reflector;
        this.configService = configService;
    }
    canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        const skipAppKey = this.reflector.getAllAndOverride(skip_app_key_decorator_1.SKIP_APP_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic || skipAppKey) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        if (!request.path.startsWith('/api/')) {
            return true;
        }
        if (request.method === 'OPTIONS') {
            return true;
        }
        const expectedKey = this.configService.get('APP_API_KEY');
        if (!expectedKey) {
            return true;
        }
        const providedKey = request.headers['x-app-key'];
        if (providedKey && providedKey === expectedKey) {
            return true;
        }
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'https://sporto.asia';
        const origin = request.headers['origin'] || '';
        const referer = request.headers['referer'] || '';
        const host = request.headers['host'] || '';
        const isAllowedDomain = (urlStr) => {
            if (!urlStr)
                return false;
            return (urlStr.includes('sporto.asia') ||
                urlStr.includes('localhost') ||
                urlStr.includes('127.0.0.1') ||
                urlStr.startsWith(frontendUrl));
        };
        if (isAllowedDomain(origin) ||
            isAllowedDomain(referer) ||
            isAllowedDomain(host)) {
            return true;
        }
        throw new common_1.ForbiddenException('Unauthorized Application (Invalid App Key)');
    }
};
exports.AppKeyGuard = AppKeyGuard;
exports.AppKeyGuard = AppKeyGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        config_1.ConfigService])
], AppKeyGuard);
//# sourceMappingURL=app-key.guard.js.map