import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SocialSessionsRepository } from './social-sessions.repository';

/**
 * Cron dọn nền: đóng các kèo Social đã quá giờ
 * (startAt + durationMinutes <= NOW()) → COMPLETED.
 * Kết hợp với lazy auto-close trong SocialSessionsService (refreshStatusIfExpired)
 * để detail/join/chat luôn đúng ngay cả giữa 2 lần cron.
 */
@Injectable()
export class SocialSessionSchedulerService {
  private readonly logger = new Logger(SocialSessionSchedulerService.name);

  constructor(private readonly repository: SocialSessionsRepository) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredSocialSessions() {
    try {
      const closed = await this.repository.closeExpiredSessions();
      if (closed.length > 0) {
        this.logger.log(`Auto-closed ${closed.length} expired social session(s).`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error auto-closing expired social sessions:', message);
    }
  }
}
