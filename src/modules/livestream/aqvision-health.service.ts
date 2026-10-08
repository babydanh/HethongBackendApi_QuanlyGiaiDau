import { Injectable, Logger } from '@nestjs/common';
import {
  AqvisionApiClient,
  AqvisionApiException,
} from './aqvision-api.client';

/** Trạng thái phát sóng dùng cho match/livestream (theo `matches.status`). */
export type StreamHealthStatus = 'LIVE' | 'ENDED';

/**
 * Kiểm tra sức khỏe stream AQVision (AQP media server bên thứ ba).
 *
 * SportO là orchestrator mỏng: KHÔNG ingest, KHÔNG transcode, KHÔNG host video.
 * Service này chỉ hỏi AQP "stream có online không" và quyết định chuyển trạng thái.
 *
 * Bất biến INV-001: KHÔNG BAO GIỜ log URL/query string (chứa secret).
 * Chỉ log matchId + providerCode khi gọi API thất bại.
 */
@Injectable()
export class AqvisionHealthService {
  private readonly logger = new Logger(AqvisionHealthService.name);

  constructor(private readonly aqvisionClient: AqvisionApiClient) {}

  /** Hỏi AQP stream có đang phát không. Ném ra ngoài khi API lỗi. */
  async checkStreamOnline(stream: string): Promise<boolean> {
    const result = await this.aqvisionClient.isMediaOnline(stream);
    return result.online;
  }

  /**
   * Logic THUẦN (không I/O): tính trạng thái kế tiếp từ trạng thái hiện tại.
   * - online + chưa LIVE ⇒ LIVE
   * - offline + đang LIVE ⇒ ENDED
   * - còn lại ⇒ null (giữ nguyên, không đổi)
   */
  shouldTransition(
    currentStatus: string,
    online: boolean,
  ): StreamHealthStatus | null {
    if (online && currentStatus !== 'LIVE') {
      return 'LIVE';
    }
    if (!online && currentStatus === 'LIVE') {
      return 'ENDED';
    }
    return null;
  }

  /**
   * Dò trạng thái online của một **stream** AQP (`stream` = `livestream_cameras.streamName`,
   * không phải `matchId` — quy ước của AQP là `vhost/app/stream`).
   * Khi AQP ném `AqvisionApiException`: KHÔNG đổi trạng thái, chỉ log WARN gồm
   * stream + providerCode (KHÔNG log URL/query — INV-001).
   */
  async pollStream(
    stream: string,
    currentStatus: string,
  ): Promise<{ nextStatus: StreamHealthStatus | null; stream: string }> {
    try {
      const online = await this.checkStreamOnline(stream);
      return { nextStatus: this.shouldTransition(currentStatus, online), stream };
    } catch (error) {
      if (error instanceof AqvisionApiException) {
        this.logger.warn(
          `AQP health check failed: stream=${stream}, providerCode=${error.providerCode}`,
        );
        return { nextStatus: null, stream };
      }
      throw error;
    }
  }
}
