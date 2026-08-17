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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AccountSanctionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountSanctionService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const redis_service_1 = require("../../providers/redis/redis.service");
const ACCESS_BAN_CACHE_PREFIX = 'account:access-ban:';
const NEGATIVE_CACHE_TTL_SECONDS = 15;
const MAX_POSITIVE_CACHE_TTL_SECONDS = 60;
let AccountSanctionService = AccountSanctionService_1 = class AccountSanctionService {
    db;
    redisService;
    logger = new common_1.Logger(AccountSanctionService_1.name);
    constructor(db, redisService) {
        this.db = db;
        this.redisService = redisService;
    }
    async hasActiveAccessBan(userId) {
        const cacheKey = this.cacheKey(userId);
        try {
            const cached = await this.redisService.get(cacheKey);
            if (cached === '1')
                return true;
            if (cached === '0')
                return false;
        }
        catch (error) {
            this.logger.warn(`Unable to read access-ban cache: ${this.errorMessage(error)}`);
        }
        const rows = await this.db
            .select({ id: schema.userBans.id, expiresAt: schema.userBans.expiresAt })
            .from(schema.userBans)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userBans.userId, userId), (0, drizzle_orm_1.eq)(schema.userBans.isActive, true), (0, drizzle_orm_1.inArray)(schema.userBans.banType, ['SOFT_BAN', 'HARD_BAN']), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema.userBans.expiresAt), (0, drizzle_orm_1.gt)(schema.userBans.expiresAt, new Date()))))
            .limit(1);
        const activeBan = rows[0];
        await this.writeCachedAccessBan(userId, activeBan?.expiresAt ?? null, Boolean(activeBan));
        return Boolean(activeBan);
    }
    async markAccessBanned(userId, expiresAt) {
        await this.writeCachedAccessBan(userId, expiresAt, true);
    }
    async invalidateAccessBan(userId) {
        try {
            await this.redisService.del(this.cacheKey(userId));
        }
        catch (error) {
            this.logger.warn(`Unable to invalidate access-ban cache: ${this.errorMessage(error)}`);
        }
    }
    async writeCachedAccessBan(userId, expiresAt, isBanned) {
        const ttlSeconds = isBanned
            ? this.positiveCacheTtl(expiresAt)
            : NEGATIVE_CACHE_TTL_SECONDS;
        if (ttlSeconds <= 0)
            return;
        try {
            await this.redisService.set(this.cacheKey(userId), isBanned ? '1' : '0', ttlSeconds);
        }
        catch (error) {
            this.logger.warn(`Unable to write access-ban cache: ${this.errorMessage(error)}`);
        }
    }
    positiveCacheTtl(expiresAt) {
        if (!expiresAt)
            return MAX_POSITIVE_CACHE_TTL_SECONDS;
        const remainingSeconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);
        return Math.min(MAX_POSITIVE_CACHE_TTL_SECONDS, Math.max(0, remainingSeconds));
    }
    cacheKey(userId) {
        return `${ACCESS_BAN_CACHE_PREFIX}${userId}`;
    }
    errorMessage(error) {
        return error instanceof Error ? error.message : 'unknown cache error';
    }
};
exports.AccountSanctionService = AccountSanctionService;
exports.AccountSanctionService = AccountSanctionService = AccountSanctionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, redis_service_1.RedisService])
], AccountSanctionService);
//# sourceMappingURL=account-sanction.service.js.map