import { Injectable, Logger } from '@nestjs/common';
import {
  AqvisionApiClient,
  AqvisionApiException,
} from './aqvision-api.client';

/** Tham số tùy chọn cho `captureSnapshot`. Bỏ trống ⇒ dùng mặc định an toàn. */
export interface CaptureSnapshotOptions {
  /** Giây chờ camera trả khung hình (client truyền `timeout_sec`). */
  readonly timeoutSec?: number;
  /** Giây hiệu lực URL snapshot do AQP sinh ra (client truyền `expire_sec`). */
  readonly expireSec?: number;
}

/**
 * Chụp ảnh snapshot (JPEG) từ luồng camera qua AQVision MediaServer.
 *
 * SportO là orchestrator mỏng: KHÔNG ingest/transcode/host video;
 * mọi xử lý media thuộc về AQP (bên thứ ba, fork ZLMediaKit).
 *
 * Bất biến:
 * - KHÔNG BAO GIỜ log `streamUrl` — URL RTSP có thể chứa credential
 *   `user:password@host` (cùng tinh thần INV-001 của client).
 * - Kiểm magic bytes JPEG (`FF D8 FF`) trước khi trả buffer: AQP có thể
 *   trả JSON/HTML lỗi thay vì ảnh (xem NEEDS_VERIFY trong docstring).
 */
@Injectable()
export class AqvisionSnapshotService {
  private readonly logger = new Logger(AqvisionSnapshotService.name);

  constructor(private readonly aqvisionClient: AqvisionApiClient) {}

  /**
   * Chụp 1 khung hình JPEG từ stream.
   *
   * Mặc định `timeoutSec=5`, `expireSec=10` khi không truyền `opts`.
   *
   * ⚠ NEEDS_VERIFY: mẫu `api.txt` của vendor gọi `getSnap` bằng
   * `response.json()` (envelope JSON), nhưng ZLMediaKit `/index/api/getSnap`
   * thực tế trả `image/jpeg` nhị phân ⇒ client đang xử lý theo nhị phân.
   * Cần verify bằng secret thật để xác nhận AQP luôn trả JPEG, không phải
   * envelope JSON lỗi. Cho tới khi verify xong, lớp này vẫn kiểm magic bytes
   * để fail-closed thay vì trả rác cho người gọi.
   *
   * Ném `AqvisionApiException(-1)` khi payload không phải JPEG hợp lệ.
   */
  async captureSnapshot(
    streamUrl: string,
    opts?: CaptureSnapshotOptions,
  ): Promise<Buffer> {
    const buffer = await this.aqvisionClient.getSnap({
      url: streamUrl,
      timeoutSec: opts?.timeoutSec ?? 5,
      expireSec: opts?.expireSec ?? 10,
    });

    if (!this.isJpeg(buffer)) {
      // Chỉ log sự kiện + operation, KHÔNG log streamUrl (INV-001).
      this.logger.warn(
        `AQP getSnap tra payload khong phai JPEG (magic bytes khong dung).`,
      );
      throw new AqvisionApiException(
        -1,
        'AQP không trả ảnh JPEG hợp lệ.',
      );
    }

    return buffer;
  }

  /**
   * Logic THUẦN: kiểm magic bytes JPEG (`FF D8 FF`).
   * Phòng trường hợp AQP trả JSON/HTML lỗi thay vì ảnh.
   * Buffer rỗng/quá ngắn ⇒ `false`.
   */
  isJpeg(buffer: Buffer): boolean {
    return (
      buffer.byteLength >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }
}
