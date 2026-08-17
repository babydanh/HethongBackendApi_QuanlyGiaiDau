import { RedisService } from '../../providers/redis/redis.service';
import { TournamentsRepository } from './tournaments.repository';
export declare class RegistrationLockService {
    private readonly redisService;
    private readonly tournamentsRepository;
    constructor(redisService: RedisService, tournamentsRepository: TournamentsRepository);
    private getActualRemainingSlots;
    reserveSlot(tournamentId: string, divisionId?: string, ttlSeconds?: number): Promise<void>;
    releaseSlot(tournamentId: string, divisionId?: string): Promise<void>;
    confirmSlot(tournamentId: string, divisionId?: string): Promise<void>;
}
