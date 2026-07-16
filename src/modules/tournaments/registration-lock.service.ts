import { Injectable, BadRequestException } from '@nestjs/common';
import { RedisService } from '../../providers/redis/redis.service';
import { TournamentsRepository } from './tournaments.repository';

@Injectable()
export class RegistrationLockService {
  constructor(
    private readonly redisService: RedisService,
    private readonly tournamentsRepository: TournamentsRepository,
  ) {}

  /**
   * Lấy số lượng slot còn lại thực tế của giải đấu/division trong database Postgres
   */
  private async getActualRemainingSlots(tournamentId: string, divisionId?: string): Promise<number> {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) return 0;

    let maxParticipants = tournament.maxParticipants;
    let currentCount = tournament._summary?.participantCount ?? 0;

    if (divisionId) {
      const division = tournament.divisions?.find(d => d.id === divisionId);
      if (division) {
        maxParticipants = division.maxParticipants;
        currentCount = division._count?.participants ?? 0;
      }
    }

    if (!maxParticipants) return 9999; // Không giới hạn số lượng tham gia
    return Math.max(0, maxParticipants - currentCount);
  }

  /**
   * Khóa giữ chỗ slot tạm thời (TTL mặc định 15 phút = 900 giây)
   */
  async reserveSlot(tournamentId: string, divisionId?: string, ttlSeconds = 900): Promise<void> {
    const redis = this.redisService.getClient();
    const lockKey = `registration:lock:${tournamentId}:${divisionId || 'all'}`;

    // 1. Kiểm tra xem key đếm slot đã có trên Redis chưa. Nếu chưa, ta khởi tạo từ Postgres
    const exists = await redis.exists(lockKey);
    if (!exists) {
      const remaining = await this.getActualRemainingSlots(tournamentId, divisionId);
      // Đặt số lượng slot và TTL (thời gian giữ chỗ)
      await redis.set(lockKey, String(remaining), 'EX', 2 * 60 * 60); // Cache tồn tại 2 tiếng để dọn dẹp
    }

    // 2. Sử dụng DECR để giảm slot đi 1 một cách nguyên tử (Atomic transaction)
    const newRemaining = await redis.decr(lockKey);

    if (newRemaining < 0) {
      // Nếu âm, tức là đã hết slot giữ chỗ. Cộng lại 1 slot và báo lỗi
      await redis.incr(lockKey);
      throw new BadRequestException('Nội dung thi đấu hoặc giải đấu hiện đã đầy slot giữ chỗ thanh toán. Vui lòng quay lại sau.');
    }

    // 3. Tạo một key giữ chỗ riêng của giao dịch này để tự động nhả ra nếu không thanh toán
    const participantLockKey = `registration:holder:${tournamentId}:${divisionId || 'all'}:${Date.now()}`;
    await redis.set(participantLockKey, '1', 'EX', ttlSeconds);
    
    console.log(`[RedisLock] Giữ chỗ thành công cho giải ${tournamentId} (còn lại ${newRemaining} slot tạm thời)`);
  }

  /**
   * Giải phóng slot giữ chỗ tạm thời (Khi thanh toán bị hủy, lỗi hoặc quá hạn)
   */
  async releaseSlot(tournamentId: string, divisionId?: string): Promise<void> {
    const redis = this.redisService.getClient();
    const lockKey = `registration:lock:${tournamentId}:${divisionId || 'all'}`;
    
    const exists = await redis.exists(lockKey);
    if (exists) {
      const newRemaining = await redis.incr(lockKey);
      console.log(`[RedisLock] Đã hoàn trả lại 1 slot cho giải ${tournamentId} (còn lại ${newRemaining} slot tạm thời)`);
    }
  }

  /**
   * Xác nhận slot chính thức (Khi thanh toán thành công, xóa cache để lần sau nạp trực tiếp số lượng chính xác từ Postgres)
   */
  async confirmSlot(tournamentId: string, divisionId?: string): Promise<void> {
    const redis = this.redisService.getClient();
    const lockKey = `registration:lock:${tournamentId}:${divisionId || 'all'}`;
    // Xóa key lock để buộc hệ thống phải tính toán lại chính xác số lượng từ database ở lượt đăng ký tiếp theo
    await redis.del(lockKey);
    console.log(`[RedisLock] Đã xác nhận slot chính thức cho giải ${tournamentId}. Đã xoá lock key.`);
  }
}
