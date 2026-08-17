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
exports.AppVersionService = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const drizzle_orm_1 = require("drizzle-orm");
let AppVersionService = class AppVersionService {
    db;
    constructor(db) {
        this.db = db;
    }
    async getVersion(platform) {
        const isIos = platform === 'ios';
        const prefix = isIos ? 'APP_IOS' : 'APP_ANDROID';
        const keys = [
            `${prefix}_LATEST_VERSION`,
            `${prefix}_MINIMUM_VERSION`,
            `${prefix}_STORE_URL`,
            'APP_RELEASE_NOTES',
        ];
        const dbConfigs = {};
        try {
            const records = await this.db
                .select({ key: schema.systemConfigs.key, value: schema.systemConfigs.value })
                .from(schema.systemConfigs)
                .where((0, drizzle_orm_1.inArray)(schema.systemConfigs.key, keys));
            for (const r of records) {
                dbConfigs[r.key] = r.value;
            }
        }
        catch (err) {
            console.error('Failed to load version configs from DB, fallback to env:', err);
        }
        const defaultLatest = '1.0.6';
        const defaultMin = '1.0.0';
        const defaultStoreUrl = isIos
            ? 'https://apps.apple.com/vn/app/Sporto/id6795829694'
            : 'https://play.google.com/store/apps/details?id=vn.Sporto.quanlygiaidau';
        return {
            platform,
            latestVersion: dbConfigs[`${prefix}_LATEST_VERSION`] || process.env[`${prefix}_LATEST_VERSION`] || defaultLatest,
            minimumVersion: dbConfigs[`${prefix}_MINIMUM_VERSION`] || process.env[`${prefix}_MINIMUM_VERSION`] || defaultMin,
            storeUrl: dbConfigs[`${prefix}_STORE_URL`] || process.env[`${prefix}_STORE_URL`] || defaultStoreUrl,
            releaseNotes: dbConfigs['APP_RELEASE_NOTES'] || process.env.APP_RELEASE_NOTES || '',
        };
    }
};
exports.AppVersionService = AppVersionService;
exports.AppVersionService = AppVersionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], AppVersionService);
//# sourceMappingURL=app-version.service.js.map