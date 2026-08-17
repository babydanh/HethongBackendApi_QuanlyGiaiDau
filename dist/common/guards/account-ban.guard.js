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
exports.AccountBanGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const public_decorator_1 = require("../decorators/public.decorator");
const account_sanction_service_1 = require("../services/account-sanction.service");
let AccountBanGuard = class AccountBanGuard {
    reflector;
    accountSanctionService;
    constructor(reflector, accountSanctionService) {
        this.reflector = reflector;
        this.accountSanctionService = accountSanctionService;
    }
    async canActivate(context) {
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }
        const { user } = context.switchToHttp().getRequest();
        const userId = user?.sub ?? user?.id;
        if (!userId) {
            return true;
        }
        if (await this.accountSanctionService.hasActiveAccessBan(userId)) {
            throw new common_1.ForbiddenException('Tài khoản của bạn đang bị hạn chế truy cập.');
        }
        return true;
    }
};
exports.AccountBanGuard = AccountBanGuard;
exports.AccountBanGuard = AccountBanGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        account_sanction_service_1.AccountSanctionService])
], AccountBanGuard);
//# sourceMappingURL=account-ban.guard.js.map