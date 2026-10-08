import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Queue } from 'bullmq';
import type { RedisService } from '../../providers/redis/redis.service';
import type { LivestreamHealthJobData } from './livestream-health.processor';

/** Thời gian giữ lease khoá theo camera (SET NX PX). */
const CAMERA_LOCK_TTL_MS = 30_000;
/** Chu kỳ gia hạn lease khi operation còn đang chạy. */
const CAMERA_LOCK_RENEW_MS = 10_000;
/** Grace period trước khi dừng ghi camera mất kết nối. */
const OFFLINE_CONFIRMATION_DELAY_MS = 60_000;
/** Tiền tố job ID ổn định theo camera (không chứa ':' — BullMQ từ chối custom Id có ':'). */
const OFFLINE_CONFIRMATION_JOB_ID = 'livestream-camera-offline-confirmation-';

/**
 * Gia hạn lease chỉ khi token trong Redis vẫn là token của ta.
 * Trả 1 khi gia hạn thành công, 0 khi lease đã mất (hết hạn hoặc
 * bị chủ khác lấy sau khi hết hạn).
 */
const RENEW_CAMERA_LOCK_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;

/** Release compare-and-delete: chỉ bên giữ lease mới xoá được lease của mình. */
const RELEASE_CAMERA_LOCK_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

interface CameraLease {
  readonly token: string;
  lost: boolean;
}

export interface CameraLeaseHandle {
  readonly cameraId: string;
  isOwned(): boolean;
}

/**
 * Queue sức khoẻ livestream: sweep 30s hiện có + job xác nhận
 * offline 60s + khoá phân tán theo camera.
 *
 * Mọi provider read/side effect cho cùng một camera phải chạy
 * dưới `runWithCameraLock` để được tuần tự hoá qua request API,
 * sweep và job xác nhận. Lease dùng owner token (SET NX PX),
 * gia hạn token-checked mỗi 10s và release compare-and-delete;
 * chỉ bên giữ lease mới được gọi provider.
 */
@Injectable()
export class LivestreamHealthQueue implements OnModuleInit {
  private readonly logger = new Logger(LivestreamHealthQueue.name);
  /** Lease đang giữ trong tiến trình này, để operation kiểm tra quyền sở hữu giữa các bước. */
  private readonly cameraLeases = new Map<string, CameraLease>();

  constructor(
    @InjectQueue('livestream-health')
    private readonly queue: Queue<LivestreamHealthJobData>,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.add(
      'health-sweep',
      { kind: 'sweep' },
      {
        jobId: 'livestream-health-sweep',
        repeat: { every: 30_000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  /**
   * Chạy `operation` dưới lease Redis theo camera.
   *
   * - Không lấy được lease (camera đang bận) ⇒ trả `null`; caller
   *   ánh xạ thành `PENDING` và để sweep thử lại.
   * - Lease được gia hạn token-checked mỗi `CAMERA_LOCK_RENEW_MS`
   *   khi operation còn chạy. Khi mất lease (gia hạn trả 0 hoặc
   *   Redis lỗi — không thể xác minh quyền sở hữu), wrapper trả
   *   `null` ngay và KHÔNG release. Callback đã chạy không thể bị
   *   hủy; callback phải kiểm tra `lease.isOwned()` trước các bước
   *   tiếp theo. Handle cũ không thể nhận nhầm lease mới cùng camera;
   *   kết quả callback sau khi mất lease bị bỏ.
   * - Operation ném ⇒ release lease rồi ném lại cho caller.
   */
  async runWithCameraLock<T>(
    cameraId: string,
    operation: (lease: CameraLeaseHandle) => Promise<T>,
  ): Promise<T | null> {
    const key = `livestream:camera-lock:${cameraId}`;
    const token = randomUUID();
    const client = this.redisService.getClient();

    const acquired = await client.set(key, token, 'PX', CAMERA_LOCK_TTL_MS, 'NX');
    if (acquired !== 'OK') {
      return null;
    }

    const lease: CameraLease = { token, lost: false };
    this.cameraLeases.set(cameraId, lease);
    const leaseHandle: CameraLeaseHandle = {
      cameraId,
      isOwned: () =>
        !lease.lost && this.cameraLeases.get(cameraId) === lease,
    };

    let renewTimer: ReturnType<typeof setInterval> | undefined;
    let signalLeaseLost: (() => void) | undefined;
    const leaseLost = new Promise<void>((resolve) => {
      signalLeaseLost = resolve;
    });

    const abandonLease = (): void => {
      if (lease.lost) return;
      lease.lost = true;
      clearInterval(renewTimer);
      if (this.cameraLeases.get(cameraId) === lease) {
        this.cameraLeases.delete(cameraId);
      }
      this.logger.warn(`Camera lock lost during operation: camera=${cameraId}`);
      signalLeaseLost?.();
    };

    renewTimer = setInterval(() => {
      void (async () => {
        try {
          const renewed = await client.eval(
            RENEW_CAMERA_LOCK_SCRIPT,
            1,
            key,
            token,
            CAMERA_LOCK_TTL_MS,
          );
          if (renewed !== 1) abandonLease();
        } catch {
          // Lỗi Redis: không thể xác minh quyền sở hữu ⇒ coi như mất lease.
          abandonLease();
        }
      })();
    }, CAMERA_LOCK_RENEW_MS);

    try {
      return await Promise.race([
        operation(leaseHandle),
        leaseLost.then(() => null as T | null),
      ]);
    } finally {
      clearInterval(renewTimer);
      if (!lease.lost) {
        try {
          await client.eval(RELEASE_CAMERA_LOCK_SCRIPT, 1, key, token);
        } catch {
          // Lease hết hạn là lưới an toàn; không fail operation vì cleanup.
          this.logger.debug(`Camera lock release skipped: camera=${cameraId}`);
        }
      }
      if (this.cameraLeases.get(cameraId) === lease) {
        this.cameraLeases.delete(cameraId);
      }
    }
  }


  /**
   * Lên job xác nhận offline cho camera sau grace period 60s.
   * Job ID ổn định theo camera: sweep 30s lặp lại khi offline
   * kéo dài sẽ không tạo job trùng (BullMQ bỏ qua add trùng jobId).
   * Xóa job lỗi cuối cùng để lần sweep sau có thể lập lại job.
   */
  async scheduleCameraOfflineConfirmation(cameraId: string): Promise<void> {
    await this.queue.add(
      'confirm-camera-offline',
      { kind: 'confirm-camera-offline', cameraId },
      {
        jobId: this.offlineConfirmationJobId(cameraId),
        delay: OFFLINE_CONFIRMATION_DELAY_MS,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  /**
   * Huỷ job xác nhận offline đang chờ của camera (camera online
   * lại hoặc hết assignment LIVE). `Queue.remove` trả 0 (không
   * ném) khi job đang chạy hoặc đã xong — không có gì để huỷ.
   */
  async cancelCameraOfflineConfirmation(cameraId: string): Promise<void> {
    await this.queue.remove(this.offlineConfirmationJobId(cameraId));
  }

  private offlineConfirmationJobId(cameraId: string): string {
    return `${OFFLINE_CONFIRMATION_JOB_ID}${cameraId}`;
  }
}
