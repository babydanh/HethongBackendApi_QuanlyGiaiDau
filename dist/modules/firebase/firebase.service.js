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
var FirebaseService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebaseService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const admin = __importStar(require("firebase-admin"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const drizzle_orm_1 = require("drizzle-orm");
let FirebaseService = FirebaseService_1 = class FirebaseService {
    configService;
    db;
    logger = new common_1.Logger(FirebaseService_1.name);
    firebaseApp = null;
    isInitialized = false;
    constructor(configService, db) {
        this.configService = configService;
        this.db = db;
    }
    onModuleInit() {
        this.initFirebase();
    }
    initFirebase() {
        if (admin.apps.length > 0) {
            this.firebaseApp = admin.apps[0];
            this.isInitialized = true;
            return;
        }
        try {
            let serviceAccount = null;
            const base64Key = this.configService.get('FIREBASE_SERVICE_ACCOUNT_BASE64');
            if (base64Key) {
                const decoded = Buffer.from(base64Key, 'base64').toString('utf8');
                serviceAccount = JSON.parse(decoded);
            }
            if (!serviceAccount) {
                const customPath = this.configService.get('FIREBASE_SERVICE_ACCOUNT_PATH');
                const candidatePaths = [
                    customPath ? path.resolve(process.cwd(), customPath) : null,
                    path.resolve(process.cwd(), 'secrets', 'firebase-service-account.json'),
                    path.resolve(process.cwd(), 'firebase-service-account.json'),
                ].filter(Boolean);
                for (const filePath of candidatePaths) {
                    if (fs.existsSync(filePath)) {
                        const raw = fs.readFileSync(filePath, 'utf8');
                        serviceAccount = JSON.parse(raw);
                        this.logger.log(`Found Firebase service account file at: ${filePath}`);
                        break;
                    }
                }
            }
            if (serviceAccount && serviceAccount.project_id && serviceAccount.private_key) {
                this.firebaseApp = admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                });
                this.isInitialized = true;
                this.logger.log(`[FirebaseService] Firebase Admin SDK initialized successfully for project: ${serviceAccount.project_id}`);
            }
            else {
                this.logger.warn('[FirebaseService] No valid Firebase service account found. Push notifications will be skipped.');
            }
        }
        catch (error) {
            this.logger.error(`[FirebaseService] Failed to initialize Firebase Admin SDK: ${error?.message || error}`);
        }
    }
    async registerDeviceToken(userId, token, platform = 'ANDROID', deviceInfo) {
        if (!token || !userId)
            return null;
        const [existing] = await this.db
            .select()
            .from(schema.userDeviceTokens)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userDeviceTokens.userId, userId), (0, drizzle_orm_1.eq)(schema.userDeviceTokens.token, token)))
            .limit(1);
        if (existing) {
            const [updated] = await this.db
                .update(schema.userDeviceTokens)
                .set({
                platform,
                deviceInfo: deviceInfo ?? existing.deviceInfo,
                isActive: true,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema.userDeviceTokens.id, existing.id))
                .returning();
            return updated;
        }
        const [created] = await this.db
            .insert(schema.userDeviceTokens)
            .values({
            userId,
            token,
            platform,
            deviceInfo: deviceInfo ?? null,
            isActive: true,
        })
            .returning();
        return created;
    }
    async removeDeviceToken(userId, token) {
        if (!token || !userId)
            return;
        await this.db
            .delete(schema.userDeviceTokens)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.userDeviceTokens.userId, userId), (0, drizzle_orm_1.eq)(schema.userDeviceTokens.token, token)));
    }
    async sendPushToUser(userId, payload) {
        return this.sendPushToUsers([userId], payload);
    }
    async sendPushToUsers(userIds, payload) {
        if (!this.isInitialized || !this.firebaseApp || userIds.length === 0) {
            return { successCount: 0, failureCount: 0 };
        }
        try {
            const activeDevices = await this.db
                .select({
                id: schema.userDeviceTokens.id,
                token: schema.userDeviceTokens.token,
                userId: schema.userDeviceTokens.userId,
            })
                .from(schema.userDeviceTokens)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema.userDeviceTokens.userId, userIds), (0, drizzle_orm_1.eq)(schema.userDeviceTokens.isActive, true)));
            if (activeDevices.length === 0) {
                return { successCount: 0, failureCount: 0 };
            }
            const tokens = Array.from(new Set(activeDevices.map((d) => d.token)));
            const sanitizedData = {};
            if (payload.data) {
                for (const [k, v] of Object.entries(payload.data)) {
                    if (v !== undefined && v !== null) {
                        sanitizedData[k] = typeof v === 'string' ? v : JSON.stringify(v);
                    }
                }
            }
            const multicastMessage = {
                tokens,
                notification: {
                    title: payload.title,
                    body: payload.body,
                    imageUrl: payload.imageUrl,
                },
                data: sanitizedData,
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        channelId: 'sporto_high_importance_channel',
                        priority: 'max',
                        defaultVibrateTimings: true,
                        defaultSound: true,
                    },
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1,
                        },
                    },
                },
            };
            const response = await admin.messaging().sendEachForMulticast(multicastMessage);
            const expiredTokenIds = [];
            response.responses.forEach((res, idx) => {
                if (!res.success && res.error) {
                    const errCode = res.error.code;
                    if (errCode === 'messaging/registration-token-not-registered' ||
                        errCode === 'messaging/invalid-registration-token') {
                        const badToken = tokens[idx];
                        const match = activeDevices.find((d) => d.token === badToken);
                        if (match) {
                            expiredTokenIds.push(match.id);
                        }
                    }
                }
            });
            if (expiredTokenIds.length > 0) {
                await this.db
                    .delete(schema.userDeviceTokens)
                    .where((0, drizzle_orm_1.inArray)(schema.userDeviceTokens.id, expiredTokenIds));
                this.logger.log(`[FirebaseService] Cleaned up ${expiredTokenIds.length} expired FCM tokens`);
            }
            this.logger.log(`[FirebaseService] Push sent to ${tokens.length} devices: ${response.successCount} success, ${response.failureCount} failure`);
            return {
                successCount: response.successCount,
                failureCount: response.failureCount,
            };
        }
        catch (err) {
            this.logger.error(`[FirebaseService] Error sending multicast push: ${err?.message || err}`);
            return { successCount: 0, failureCount: 0 };
        }
    }
};
exports.FirebaseService = FirebaseService;
exports.FirebaseService = FirebaseService = FirebaseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [config_1.ConfigService, Object])
], FirebaseService);
//# sourceMappingURL=firebase.service.js.map