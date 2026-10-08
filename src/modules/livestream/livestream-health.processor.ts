import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { LiveSessionRepository } from './live-session.repository';
import { LiveSessionService } from './live-session.service';
import { LivestreamRepository } from './livestream.repository';
import { LivestreamHealthQueue } from './livestream-health.queue';
import { AqvisionRecordingService } from './aqvision-recording.service';

export type LivestreamHealthJobData =
  | { readonly kind: 'sweep' }
  | { readonly kind: 'confirm-camera-offline'; readonly cameraId: string };

const HEALTH_CHECK_CONCURRENCY = 4;

/**
 * Worker sức khoẻ livestream:
 * - `sweep` (30s): kiểm tra sức khoẻ live session hiện có,
 *   rồi điều phối ghi MP4 cho mọi camera còn assignment
 *   trận (kể cả assignment `OFFLINE`) — mỗi camera dưới
 *   khoá riêng của nó.
 * - `confirm-camera-offline` (delayed 60s): xác nhận camera
 *   vẫn offline sau grace period trước khi dừng ghi.
 *
 * Mọi provider read/side effect cho cùng camera đều chạy
 * dưới `LivestreamHealthQueue.runWithCameraLock` để tuần
 * tự hoá với request API và chính sweep. Lỗi provider hoặc
 * mất khoá không làm job thất bại: sweep tiếp theo thử lại.
 */

@Processor('livestream-health')
export class LivestreamHealthProcessor extends WorkerHost {
  private readonly logger = new Logger(LivestreamHealthProcessor.name);

  constructor(
    private readonly liveSessionRepository: LiveSessionRepository,
    private readonly liveSessionService: LiveSessionService,
    private readonly livestreamRepository: LivestreamRepository,
    private readonly livestreamHealthQueue: LivestreamHealthQueue,
    private readonly aqvisionRecordingService: AqvisionRecordingService,
  ) {
    super();
  }

  async process(job: Job<LivestreamHealthJobData>): Promise<void> {
    if (job.data.kind === 'confirm-camera-offline') {
      await this.processCameraOfflineConfirmation(job.data.cameraId);
      return;
    }

    if (job.data.kind !== 'sweep') {
      return;
    }

    const sessions = await this.liveSessionRepository.listActiveLiveSessions();
    for (
      let index = 0;
      index < sessions.length;
      index += HEALTH_CHECK_CONCURRENCY
    ) {
      const batch = sessions.slice(index, index + HEALTH_CHECK_CONCURRENCY);
      await Promise.allSettled(
        batch.map((session) =>
          this.liveSessionService.checkSessionHealth(session.id),
        ),
      );
    }

    await this.reconcileCameraRecordings();
  }

  /**
   * Điều phối ghi MP4 cho mọi camera còn assignment trận.
   * Repository đã gom theo camera (một dòng mỗi camera,
   * `hasLiveAssignment` là aggregate trên mọi assignment),
   * nên camera chia sẻ nhiều trận chỉ được reconcile một
   * lần với trạng thái tổng hợp.
   */
  private async reconcileCameraRecordings(): Promise<void> {
    const targets = await this.livestreamRepository.listCameraRecordingTargets();
    for (const target of targets) {
      try {
        const status = await this.livestreamHealthQueue.runWithCameraLock(
          target.cameraId,
          (lease) =>
            this.aqvisionRecordingService.reconcileCamera(
              target.cameraId,
              lease,
            ),
        );
        if (status === null) {
          // Mất khoá: camera đang bận bởi request/worker khác.
          // Trả PENDING ở đường API; sweep tiếp theo thử lại.
          this.logger.warn(
            `Camera recording reconciliation skipped: camera=${target.cameraId} (lock contention)`,
          );
        }
      } catch {
        // Lỗi provider (AQVision timeout/sai secret) không được
        // làm sập sweep: camera tiếp theo vẫn reconcile, sweep
        // tiếp theo thử lại camera này. Chỉ log cameraId —
        // KHÔNG log error/URL/query (có thể chứa secret).
        this.logger.warn(
          `Camera recording reconciliation failed: camera=${target.cameraId}`,
        );
      }
    }
  }

  private async processCameraOfflineConfirmation(
    cameraId: string,
  ): Promise<void> {
    try {
      await this.livestreamHealthQueue.runWithCameraLock(
        cameraId,
        (lease) =>
          this.aqvisionRecordingService.confirmCameraOffline(cameraId, lease),
      );
    } catch {
      // Giữ lỗi provider/mất lease trong phạm vi camera này để
      // không làm sập worker. Job hoàn tất; sweep sau có thể lên
      // grace period mới. Chỉ log cameraId.
      this.logger.warn(
        `Camera offline confirmation failed: camera=${cameraId}`,
      );
    }
  }
}
