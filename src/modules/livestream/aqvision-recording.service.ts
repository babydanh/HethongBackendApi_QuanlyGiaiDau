import { Injectable, Logger } from '@nestjs/common';
import { AqvisionApiClient } from './aqvision-api.client';
import { LivestreamRepository } from './livestream.repository';
import {
  LivestreamHealthQueue,
  type CameraLeaseHandle,
} from './livestream-health.queue';

/**
 * Trạng thái ghi MP4 của một camera theo góc nhìn điều phối:
 * - `RECORDING`: provider xác nhận đang ghi (hoặc vừa bắt đầu).
 * - `STOPPED`: không còn yêu cầu ghi (không assignment LIVE, hoặc
 *   đã dừng sau grace period offline).
 * - `PENDING`: trạng thái chưa xác định được (media offline đang
 *   chờ xác nhận, hoặc lỗi provider/lock — caller để sweep thử lại).
 */
export type RecordingStatus = 'RECORDING' | 'STOPPED' | 'PENDING';

/** Một file MP4 đã ghi trên media server AQP. */
export interface AqvisionRecordFile {
  readonly name: string;
  /** Chỉ có khi AQP trả `sizeBytes` cho tên đó; KHÔNG bịa 0 khi thiếu. */
  readonly sizeBytes?: number;
}

/**
 * Service duyệt bản ghi MP4 từ AQVision MediaServer (AQP).
 *
 * SportO là orchestrator mỏng: KHÔNG ingest, KHÔNG transcode, KHÔNG host video.
 * Service này chỉ đọc danh mục bản ghi qua `AqvisionApiClient` và ghép đường dẫn
 * filesystem lưu trữ; KHÔNG dựng URL phát công khai.
 *
 * Bất biến:
 * - Host phát công khai **CHƯA XÁC ĐỊNH**: probe `api.media.aqvision.net` trả
 *   `Playback on management port is forbidden.` ⇒ `playbackUrl` phải để `null`,
 *   KHÔNG tự bịa URL. Caller muốn phát public phải chờ infra xác định host.
 * - `sizeBytes` chỉ lấy từ AQP; file không có trong `files[]` ⇒ `undefined`,
 *   KHÔNG bịa 0 (tránh hiểu nhầm "file rỗng").
 */
@Injectable()
export class AqvisionRecordingService {
  private readonly logger = new Logger(AqvisionRecordingService.name);

  constructor(
    private readonly aqvisionApiClient: AqvisionApiClient,
    private readonly livestreamRepository: LivestreamRepository,
    private readonly livestreamHealthQueue: LivestreamHealthQueue,
  ) {}

  /**
   * Liệt kê các thư mục ngày có bản ghi của `stream` (gọi KHÔNG `period`).
   * AQP trả `paths[]` = tên thư mục ngày (vd `2020-01-24`).
   */
  async listRecordDays(stream: string): Promise<string[]> {
    // Không truyền `period` ⇒ AQP liệt kê thư mục ngày.
    const result = await this.aqvisionApiClient.getMp4RecordFile({ stream });
    return result.paths;
  }

  /**
   * Liệt kê file MP4 trong một ngày (`period` dạng `YYYY-MM-DD`).
   * Gọi với `withSize: true` để lấy `files[]`; ghép `sizeBytes` theo `name`.
   *
   * File có trong `paths[]` nhưng không có trong `files[]` (AQP không trả kích
   * thước) ⇒ `sizeBytes` undefined — KHÔNG bịa 0.
   */
  async listRecordFiles(
    stream: string,
    period: string,
  ): Promise<AqvisionRecordFile[]> {
    const result = await this.aqvisionApiClient.getMp4RecordFile({
      stream,
      period,
      withSize: true,
    });

    // Ghép theo tên: `paths[]` là nguồn thứ tự, `files[]` chỉ bổ sung size.
    const sizeByName = new Map<string, number>(
      (result.files ?? []).map((file) => [file.name, file.sizeBytes]),
    );

    return result.paths.map((name) => {
      const sizeBytes = sizeByName.get(name);
      // `Map.get` trả undefined khi thiếu ⇒ giữ undefined, KHÔNG mặc định 0.
      return sizeBytes === undefined ? { name } : { name, sizeBytes };
    });
  }

  /**
   * Ghép đường dẫn filesystem của file ghi trên AQP: `rootPath` + `period` + `fileName`.
   * Logic THUẦN (không gọi mạng), chuẩn hoá `/` — không thừa, không thiếu slash.
   *
   * `rootPath` từ AQP thường đã có trailing slash (vd `/www/live/ss/2020-01-24/`),
   * nhưng vẫn chuẩn hoá phòng khi caller truyền dạng không có slash.
   */
  buildStoragePath(rootPath: string, period: string, fileName: string): string {
    const join = (left: string, right: string): string =>
      `${left.replace(/\/+$/, '')}/${right.replace(/^\/+/, '')}`;

    return join(join(rootPath, period), fileName);
  }

  /**
   * Điều phối trạng thái ghi MP4 của một camera theo trạng thái
   * hiện hành: assignment trận (PostgreSQL) + online (AQVision)
   * đang ghi (AQVision). Phương thức này KHÔNG tự lấy khoá
   * camera — caller (API start/stop, sweep, job xác nhận) phải
   * chạy nó dưới `LivestreamHealthQueue.runWithCameraLock`.
   *
   * - Còn assignment `LIVE` và media online: đảm bảo đang ghi
   *   (`isRecording` làm điều kiện idempotency — chỉ gọi
   *   `startRecord` khi chưa ghi).
   * - Còn assignment `LIVE` nhưng media offline: lên job xác
   *   nhận sau grace period 60s, trả `PENDING`. Bản ghi đang
   *   chạy được giữ nguyên tới khi xác nhận.
   * - Không còn assignment `LIVE` (hoặc không còn assignment
   *   nào): dừng ghi chỉ khi AQVision xác nhận đang ghi, huỷ
   *   job xác nhận offline đang chờ.
   * - Camera/assignment đã xoá (không có projection): trả
   *   `STOPPED` mà không gọi provider.
   * - Mất lease giữa operation (gia hạn fail/Redis lỗi):
   *   KHÔNG phát lệnh provider/queue tiếp, trả `PENDING`
   *   (kiểm tra `lease.isOwned()` sau mỗi read await).
   *
   * Lỗi provider ném ra ngoài (message đã được làm sạch,
   * không chứa secret/URL/query); caller ánh xạ thành
   * `PENDING` và để sweep thử lại.
   */
  async reconcileCamera(
    cameraId: string,
    lease: CameraLeaseHandle,
  ): Promise<RecordingStatus> {
    const target = await this.livestreamRepository.findCameraRecordingTarget(
      cameraId,
    );
    if (!target) {
      return 'STOPPED';
    }

    if (!target.hasLiveAssignment) {
      // Không còn trận LIVE nào: dừng ghi nếu provider vẫn
      // đang ghi. Job xác nhận offline không còn ý nghĩa.
      // Mất lease giữa operation (gia hạn fail/Redis lỗi):
      // không phát lệnh queue/provider tiếp — để sweep
      // thử lại.
      if (!lease.isOwned()) {
        return 'PENDING';
      }
      await this.livestreamHealthQueue.cancelCameraOfflineConfirmation(
        cameraId,
      );
      if (!lease.isOwned()) {
        // Mất lease sau queue cancel: không phát
        // provider read tiếp.
        return 'PENDING';
      }
      const recording = await this.aqvisionApiClient.isRecordingMp4(
        target.streamName,
      );
      if (!lease.isOwned()) {
        return 'PENDING';
      }
      if (recording) {
        await this.aqvisionApiClient.stopRecordMp4(target.streamName);
        this.logger.log(`Stopped MP4 recording: camera=${cameraId}`);
      }
      return 'STOPPED';
    }

    if (!lease.isOwned()) {
      // Mất lease sau repository read: không phát
      // provider read tiếp — để sweep thử lại.
      return 'PENDING';
    }
    const { online } = await this.aqvisionApiClient.isMediaOnline(
      target.streamName,
    );
    if (!lease.isOwned()) {
      // Mất lease giữa operation: không phát lệnh
      // queue/provider tiếp — để sweep thử lại.
      return 'PENDING';
    }
    if (!online) {
      // Media offline: giữ bản ghi đang chạy, xác nhận dừng
      // sau grace period. Chưa phát lệnh ghi nào cho provider.
      await this.livestreamHealthQueue.scheduleCameraOfflineConfirmation(
        cameraId,
      );
      this.logger.debug(
        `Scheduled offline confirmation: camera=${cameraId}`,
      );
      return 'PENDING';
    }

    // Media online: huỷ xác nhận offline (nếu đang chờ) và
    // đảm bảo đang ghi.
    await this.livestreamHealthQueue.cancelCameraOfflineConfirmation(
      cameraId,
    );
    if (!lease.isOwned()) {
      // Mất lease sau queue cancel: không phát
      // provider read tiếp.
      return 'PENDING';
    }
    const recording = await this.aqvisionApiClient.isRecordingMp4(
      target.streamName,
    );
    if (!lease.isOwned()) {
      // Mất lease giữa operation: không phát lệnh ghi tiếp.
      return 'PENDING';
    }
    if (!recording) {
      await this.aqvisionApiClient.startRecordMp4(target.streamName);
      this.logger.log(`Started MP4 recording: camera=${cameraId}`);
    }
    return 'RECORDING';
  }

  /**
   * Job xác nhận offline sau grace period 60s: đọc lại
   * assignment và trạng thái online NGAY TRƯỚC side effect.
   * Chạy dưới `runWithCameraLock` như mọi thao tác ghi MP4.
   *
   * - Media online lại: KHÔNG dừng ghi; uỷ cho
   *   `reconcileCamera` với trạng thái hiện hành nhất (camera
   *   sống lại trong khi còn trận LIVE sẽ tự ghi tiếp).
   * - Không còn assignment `LIVE` (hoặc không còn projection):
   *   KHÔNG dừng ở đây — sweep/reconcile mới là đường dừng
   *   ghi; trả `PENDING`.
   * - Vẫn offline sau grace period: dừng ghi chỉ khi AQVision
   *   xác nhận đang ghi (`isRecording` làm điều kiện
   *   idempotency).
   * - Mất lease giữa operation: KHÔNG phát lệnh dừng
   *   tiếp, trả `PENDING` (kiểm tra `lease.isOwned()`
   *   trước `stopRecordMp4`).
   *
   * Lỗi provider ném ra ngoài (message đã làm sạch); job
   * sẽ được BullMQ thử lại và sweep tạo lại grace period.
   */
  async confirmCameraOffline(
    cameraId: string,
    lease: CameraLeaseHandle,
  ): Promise<RecordingStatus> {
    const target = await this.livestreamRepository.findCameraRecordingTarget(
      cameraId,
    );
    if (!target || !target.hasLiveAssignment) {
      // Job xác nhận không phải đường dừng ghi: không còn
      // assignment LIVE nghĩa là reconcile/sweep sẽ dừng.
      return 'PENDING';
    }

    if (!lease.isOwned()) {
      // Mất lease sau repository read: không phát
      // provider read tiếp — để sweep thử lại.
      return 'PENDING';
    }
    const { online } = await this.aqvisionApiClient.isMediaOnline(
      target.streamName,
    );
    if (!lease.isOwned()) {
      // Mất lease sau isMediaOnline: không uỷ reconcile
      // (online) cũng không phát read/stop tiếp (offline).
      return 'PENDING';
    }
    if (online) {
      // Camera sống lại trước khi xác nhận: tuyệt đối không
      // dừng; đảm bảo ghi tiếp nếu cần. `reconcileCamera`
      // tự kiểm tra lease trước mọi read/side effect.
      this.logger.debug(
        `Camera back online before offline confirmation: camera=${cameraId}`,
      );
      return this.reconcileCamera(cameraId, lease);
    }

    // Vẫn offline đủ grace period: dừng nếu provider xác
    // nhận đang ghi — nhưng chỉ khi lease còn (race với
    // gia hạn lease trong `runWithCameraLock`).
    const recording = await this.aqvisionApiClient.isRecordingMp4(
      target.streamName,
    );
    if (!lease.isOwned()) {
      // Mất lease giữa operation: không phát lệnh dừng tiếp.
      return 'PENDING';
    }
    if (recording) {
      await this.aqvisionApiClient.stopRecordMp4(target.streamName);
      this.logger.log(
        `Stopped MP4 recording after offline grace period: camera=${cameraId}`,
      );
    }
    return 'STOPPED';
  }
}
