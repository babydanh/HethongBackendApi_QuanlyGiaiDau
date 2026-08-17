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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = __importDefault(require("ioredis"));
let RedisService = RedisService_1 = class RedisService {
    configService;
    logger = new common_1.Logger(RedisService_1.name);
    client;
    constructor(configService) {
        this.configService = configService;
    }
    onModuleInit() {
        const host = this.configService.get('REDIS_HOST') || 'localhost';
        const port = Number(this.configService.get('REDIS_PORT')) || 6379;
        const password = this.configService.get('REDIS_PASSWORD');
        this.logger.log(`Connecting to Redis at ${host}:${port}...`);
        this.client = new ioredis_1.default({
            host,
            port,
            password: password || undefined,
            maxRetriesPerRequest: null,
        });
        this.client.on('connect', () => {
            this.logger.log('Successfully connected to Redis');
        });
        this.client.on('error', (err) => {
            this.logger.error('Redis connection error:', err);
        });
    }
    onModuleDestroy() {
        if (this.client) {
            this.client.disconnect();
        }
    }
    getClient() {
        return this.client;
    }
    async get(key) {
        return await this.client.get(key);
    }
    async set(key, value, ttlSeconds) {
        if (ttlSeconds) {
            return await this.client.set(key, value, 'EX', ttlSeconds);
        }
        return await this.client.set(key, value);
    }
    async del(key) {
        return await this.client.del(key);
    }
    async delByPattern(pattern) {
        let deletedCount = 0;
        let cursor = '0';
        do {
            const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                deletedCount += await this.client.del(...keys);
            }
        } while (cursor !== '0');
        return deletedCount;
    }
    async hset(key, field, value) {
        return await this.client.hset(key, field, value);
    }
    async hget(key, field) {
        return await this.client.hget(key, field);
    }
    async hgetall(key) {
        return await this.client.hgetall(key);
    }
    async hdel(key, field) {
        return await this.client.hdel(key, field);
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map