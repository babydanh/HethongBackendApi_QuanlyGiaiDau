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
exports.VerifiedGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const verified_decorator_1 = require("../decorators/verified.decorator");
const public_decorator_1 = require("../decorators/public.decorator");
let VerifiedGuard = class VerifiedGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const isVerifiedRoute = this.reflector.getAllAndOverride(verified_decorator_1.VERIFIED_KEY, [context.getHandler(), context.getClass()]);
        if (!isVerifiedRoute) {
            return true;
        }
        const { user } = context.switchToHttp().getRequest();
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }
        if (!user) {
            return true;
        }
        if (user.isMock) {
            return true;
        }
        return true;
    }
};
exports.VerifiedGuard = VerifiedGuard;
exports.VerifiedGuard = VerifiedGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], VerifiedGuard);
//# sourceMappingURL=verified.guard.js.map