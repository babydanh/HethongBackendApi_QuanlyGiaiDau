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
exports.DatabaseModule = exports.PG_SQL_CLIENT = exports.PG_CONNECTION = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const postgres_js_1 = require("drizzle-orm/postgres-js");
const schema = __importStar(require("./schema"));
const postgres_client_1 = require("./postgres-client");
exports.PG_CONNECTION = 'PG_CONNECTION';
exports.PG_SQL_CLIENT = 'PG_SQL_CLIENT';
let DatabaseLifecycleService = class DatabaseLifecycleService {
    sql;
    constructor(sql) {
        this.sql = sql;
    }
    async onApplicationShutdown() {
        await this.sql.end();
    }
};
DatabaseLifecycleService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(exports.PG_SQL_CLIENT)),
    __metadata("design:paramtypes", [Function])
], DatabaseLifecycleService);
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                provide: exports.PG_SQL_CLIENT,
                inject: [config_1.ConfigService],
                useFactory: (configService) => (0, postgres_client_1.createPostgresClientFromConfig)(configService),
            },
            {
                provide: exports.PG_CONNECTION,
                inject: [exports.PG_SQL_CLIENT],
                useFactory: (sql) => (0, postgres_js_1.drizzle)(sql, { schema }),
            },
            DatabaseLifecycleService,
        ],
        exports: [exports.PG_CONNECTION, exports.PG_SQL_CLIENT],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map