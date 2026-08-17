import type { AppDb } from '../../database/db.types';
import { RedisService } from '../../providers/redis/redis.service';
export declare class AccountSanctionService {
    private readonly db;
    private readonly redisService;
    private readonly logger;
    constructor(db: AppDb, redisService: RedisService);
    hasActiveAccessBan(userId: string): Promise<boolean>;
    markAccessBanned(userId: string, expiresAt: Date | null): Promise<void>;
    invalidateAccessBan(userId: string): Promise<void>;
    private writeCachedAccessBan;
    private positiveCacheTtl;
    private cacheKey;
    private errorMessage;
}
