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
exports.AuthRepository = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
let AuthRepository = class AuthRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findUserByEmail(email) {
        const users = await this.db
            .select()
            .from(schema.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.users.email, email), (0, drizzle_orm_1.isNull)(schema.users.deletedAt)))
            .limit(1);
        return users[0];
    }
    async findUserRoles(userId) {
        const result = await this.db
            .select({
            roleName: schema.roles.name,
        })
            .from(schema.userToRoles)
            .innerJoin(schema.roles, (0, drizzle_orm_1.eq)(schema.userToRoles.roleId, schema.roles.id))
            .where((0, drizzle_orm_1.eq)(schema.userToRoles.userId, userId));
        return result.map((r) => r.roleName);
    }
    async findRoleByName(roleName) {
        const roles = await this.db
            .select()
            .from(schema.roles)
            .where((0, drizzle_orm_1.eq)(schema.roles.name, roleName))
            .limit(1);
        return roles[0];
    }
    async createDefaultUserRanks(userId) {
        const categories = await this.db
            .select({ id: schema.categories.id })
            .from(schema.categories);
        for (const cat of categories) {
            const existing = await this.db
                .select()
                .from(schema.userRanks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userRanks.userId, userId), (0, drizzle_orm_1.eq)(schema.userRanks.categoryId, cat.id), (0, drizzle_orm_1.eq)(schema.userRanks.matchType, 'SINGLES'), (0, drizzle_orm_1.isNull)(schema.userRanks.communityId), (0, drizzle_orm_1.isNull)(schema.userRanks.genderRestriction)))
                .limit(1);
            if (existing.length === 0) {
                const [lowestTier] = await this.db
                    .select()
                    .from(schema.eloTiers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.eloTiers.categoryId, cat.id), (0, drizzle_orm_1.eq)(schema.eloTiers.name, 'Low Tier D')))
                    .limit(1);
                await this.db.insert(schema.userRanks).values({
                    userId,
                    categoryId: cat.id,
                    matchType: 'SINGLES',
                    eloPoints: 1000,
                    tierId: lowestTier?.id,
                }).onConflictDoNothing();
            }
        }
    }
    async createUserWithProfile(userData, profileData, defaultRoleId) {
        return await this.db.transaction(async (tx) => {
            const [newUser] = await tx
                .insert(schema.users)
                .values(userData)
                .returning();
            profileData.userId = newUser.id;
            await tx.insert(schema.profiles).values(profileData);
            await tx.insert(schema.userToRoles).values({
                userId: newUser.id,
                roleId: defaultRoleId,
            });
            return newUser;
        });
    }
    async createSession(sessionData) {
        const [session] = await this.db
            .insert(schema.sessions)
            .values(sessionData)
            .returning();
        return session;
    }
    async findSessionByRefreshToken(refreshToken) {
        const sessions = await this.db
            .select()
            .from(schema.sessions)
            .where((0, drizzle_orm_1.eq)(schema.sessions.refreshToken, refreshToken))
            .limit(1);
        return sessions[0];
    }
    async updateSession(id, updateData) {
        return await this.db
            .update(schema.sessions)
            .set(updateData)
            .where((0, drizzle_orm_1.eq)(schema.sessions.id, id))
            .returning();
    }
    async revokeSessionByToken(refreshToken) {
        return await this.db
            .update(schema.sessions)
            .set({ isRevoked: true, revokedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.sessions.refreshToken, refreshToken))
            .returning();
    }
    async findAuthProvider(provider, providerUserId) {
        const result = await this.db
            .select()
            .from(schema.authProviders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.authProviders.provider, provider), (0, drizzle_orm_1.eq)(schema.authProviders.providerUserId, providerUserId)))
            .limit(1);
        return result[0];
    }
    async createAuthProvider(data) {
        const [record] = await this.db
            .insert(schema.authProviders)
            .values(data)
            .onConflictDoUpdate({
            target: [schema.authProviders.provider, schema.authProviders.providerUserId],
            set: {
                providerEmail: data.providerEmail,
                providerAvatarUrl: data.providerAvatarUrl,
                providerDisplayName: data.providerDisplayName,
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
            },
        })
            .returning();
        return record;
    }
    async createOAuthUser(userData, profileData, defaultRoleId) {
        return await this.db.transaction(async (tx) => {
            const [newUser] = await tx
                .insert(schema.users)
                .values({
                email: userData.email,
                passwordHash: userData.passwordHash,
                isEmailVerified: userData.isEmailVerified ?? true,
            })
                .returning();
            profileData.userId = newUser.id;
            await tx.insert(schema.profiles).values(profileData);
            await tx.insert(schema.userToRoles).values({
                userId: newUser.id,
                roleId: defaultRoleId,
            });
            return newUser;
        });
    }
};
exports.AuthRepository = AuthRepository;
exports.AuthRepository = AuthRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], AuthRepository);
//# sourceMappingURL=auth.repository.js.map