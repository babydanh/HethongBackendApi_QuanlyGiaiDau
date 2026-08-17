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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistrationLockService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../providers/redis/redis.service");
const tournaments_repository_1 = require("./tournaments.repository");
let RegistrationLockService = class RegistrationLockService {
    redisService;
    tournamentsRepository;
    constructor(redisService, tournamentsRepository) {
        this.redisService = redisService;
        this.tournamentsRepository = tournamentsRepository;
    }
    async getActualRemainingSlots(tournamentId, divisionId) {
        const tournament = await this.tournamentsRepository.findById(tournamentId);
        if (!tournament)
            return 0;
        let maxParticipants = tournament.maxParticipants;
        let currentCount = tournament._summary?.participantCount ?? 0;
        if (divisionId) {
            const division = tournament.divisions?.find(d => d.id === divisionId);
            if (division) {
                maxParticipants = division.maxParticipants;
                currentCount = division._count?.participants ?? 0;
            }
        }
        if (!maxParticipants)
            return 9999;
        return Math.max(0, maxParticipants - currentCount);
    }
    async reserveSlot(tournamentId, divisionId, ttlSeconds = 900) {
        const redis = this.redisService.getClient();
        const lockKey = `registration:lock:${tournamentId}:${divisionId || 'all'}`;
        const exists = await redis.exists(lockKey);
        if (!exists) {
            const remaining = await this.getActualRemainingSlots(tournamentId, divisionId);
            await redis.set(lockKey, String(remaining), 'EX', 2 * 60 * 60);
        }
        const newRemaining = await redis.decr(lockKey);
        if (newRemaining < 0) {
            await redis.incr(lockKey);
            throw new common_1.BadRequestException('Nội dung thi đấu hoặc giải đấu hiện đã đầy slot giữ chỗ thanh toán. Vui lòng quay lại sau.');
        }
        const participantLockKey = `registration:holder:${tournamentId}:${divisionId || 'all'}:${Date.now()}`;
        await redis.set(participantLockKey, '1', 'EX', ttlSeconds);
        console.log(`[RedisLock] Giữ chỗ thành công cho giải ${tournamentId} (còn lại ${newRemaining} slot tạm thời)`);
    }
    async releaseSlot(tournamentId, divisionId) {
        const redis = this.redisService.getClient();
        const lockKey = `registration:lock:${tournamentId}:${divisionId || 'all'}`;
        const exists = await redis.exists(lockKey);
        if (exists) {
            const newRemaining = await redis.incr(lockKey);
            console.log(`[RedisLock] Đã hoàn trả lại 1 slot cho giải ${tournamentId} (còn lại ${newRemaining} slot tạm thời)`);
        }
    }
    async confirmSlot(tournamentId, divisionId) {
        const redis = this.redisService.getClient();
        const lockKey = `registration:lock:${tournamentId}:${divisionId || 'all'}`;
        await redis.del(lockKey);
        console.log(`[RedisLock] Đã xác nhận slot chính thức cho giải ${tournamentId}. Đã xoá lock key.`);
    }
};
exports.RegistrationLockService = RegistrationLockService;
exports.RegistrationLockService = RegistrationLockService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        tournaments_repository_1.TournamentsRepository])
], RegistrationLockService);
//# sourceMappingURL=registration-lock.service.js.map