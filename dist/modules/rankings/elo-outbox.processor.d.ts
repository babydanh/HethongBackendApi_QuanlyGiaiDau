import type { AppDb } from '../../database/db.types';
import { RankingsService } from './rankings.service';
export declare class EloOutboxProcessor {
    private readonly db;
    private readonly rankingsService;
    private readonly logger;
    private readonly instanceId;
    constructor(db: AppDb, rankingsService: RankingsService);
    processOutbox(): Promise<void>;
    private claimOne;
    private processClaimed;
}
