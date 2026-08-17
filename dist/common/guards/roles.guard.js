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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RolesGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const drizzle_orm_1 = require("drizzle-orm");
const roles_decorator_1 = require("../decorators/roles.decorator");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
let RolesGuard = class RolesGuard {
    reflector;
    db;
    constructor(reflector, db) {
        this.reflector = reflector;
        this.db = db;
    }
    async canActivate(context) {
        const requiredRoles = this.reflector.getAllAndOverride(roles_decorator_1.ROLES_KEY, [context.getHandler(), context.getClass()]);
        if (!requiredRoles) {
            return true;
        }
        const { user } = context.switchToHttp().getRequest();
        if (!user || !Array.isArray(user.roles)) {
            throw new common_1.ForbiddenException('User roles not found');
        }
        const tokenRoles = user.roles;
        const matchedRoles = requiredRoles.filter((role) => tokenRoles.includes(role));
        if (matchedRoles.length === 0) {
            throw new common_1.ForbiddenException('You do not have permission to access this resource');
        }
        const userId = user.sub ?? user.id;
        if (!userId) {
            throw new common_1.ForbiddenException('User roles not found');
        }
        const activeRole = await this.db
            .select({ roleName: schema.roles.name })
            .from(schema.userToRoles)
            .innerJoin(schema.roles, (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, schema.roles.id))
            .innerJoin(schema.users, (0, drizzle_orm_1.eq)(schema.userToRoles.userId, schema.users.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userToRoles.userId, userId), (0, drizzle_orm_1.inArray)(schema.roles.name, matchedRoles), (0, drizzle_orm_1.isNull)(schema.users.deletedAt), (0, drizzle_orm_1.sql) `not exists (
          select 1 from ${schema.userBans} active_ban
          where active_ban.user_id = ${schema.userToRoles.userId}
            and active_ban.is_active = true
            and active_ban.ban_type in ('SOFT_BAN', 'HARD_BAN')
            and (active_ban.expires_at is null or active_ban.expires_at > now())
        )`))
            .limit(1);
        if (activeRole.length === 0) {
            throw new common_1.ForbiddenException('Your role is no longer valid');
        }
        return true;
    }
};
exports.RolesGuard = RolesGuard;
exports.RolesGuard = RolesGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [core_1.Reflector, Object])
], RolesGuard);
//# sourceMappingURL=roles.guard.js.map