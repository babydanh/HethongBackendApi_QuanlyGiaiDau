import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AqvisionApiException } from './aqvision-api.client';

/**
 * Payload QR publish theo docx §2.2 — ĐÚNG 5 field, KHÔNG thêm bớt.
 * Thứ tự field cố định (JSON.stringify giữ nguyên thứ tự khai báo):
 * stream_url, match_id, match_title, protocol, auto_start.
 */
export interface AqvisionQrPayload {
  readonly stream_url: string;
  readonly match_id: string;
  readonly match_title: string;
  readonly protocol: 'rtsp';
  readonly auto_start: boolean;
}

/** Tham số ghép payload. `pushPort` nhận string hoặc number từ env/config. */
export interface BuildQrPayloadInput {
  readonly matchId: string;
  readonly matchTitle: string;
  readonly publishKey: string;
  readonly pushHost: string;
  readonly pushPort: string | number;
  readonly autoStart?: boolean;
}

/**
 * Service thuần logic: ghép payload QR publish để AQP (media server bên thứ
 * ba) đẩy luồng về. KHÔNG inject AqvisionApiClient — `publish_key` do AQP
 * cấp qua kênh khác, không endpoint nào trong 11 endpoint trả nó.
 *
 * BẤT BIẾN (ghi rõ, liên quan release):
 * - INV-002 (CHƯA thiết kế xong — ĐIỀU KIỆN CHẶN RELEASE): QR chứa
 *   `publish_key` = credential đẩy luồng ⇒ ai chụp màn hình cũng đẩy được
 *   luồng giả. Cần TTL ngắn + rotate + thu hồi + giới hạn 1 phiên.
 * - Host/port push trong docx (media.aqvision.net:18554) KHÔNG dùng được —
 *   chưa xác định, phải lấy từ AQP qua env AQVISION_PUSH_HOST/AQVISION_PUSH_PORT.
 * - INV-001: KHÔNG BAO GIỜ log URL/query string (chứa publish_key).
 *   Chỉ log tên method/operation, không log giá trị credential.
 */
@Injectable()
export class AqvisionPublishService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Ghép payload QR publish. Fail-closed: thiếu publishKey/pushHost/pushPort
   * (hoặc matchId) ⇒ ném AqvisionApiException(-300), KHÔNG tạo QR thiếu
   * credential.
   */
  buildQrPayload(input: BuildQrPayloadInput): AqvisionQrPayload {
    const matchId = (input.matchId ?? '').trim();
    const publishKey = (input.publishKey ?? '').trim();
    const pushHost = (input.pushHost ?? '').trim();
    const pushPort = String(input.pushPort ?? '').trim();

    if (publishKey.length === 0) {
      throw new AqvisionApiException(
        -300,
        'publishKey is required to build a publish QR payload',
      );
    }
    if (pushHost.length === 0) {
      throw new AqvisionApiException(
        -300,
        'pushHost is required to build a publish QR payload',
      );
    }
    if (pushPort.length === 0) {
      throw new AqvisionApiException(
        -300,
        'pushPort is required to build a publish QR payload',
      );
    }
    if (matchId.length === 0) {
      throw new AqvisionApiException(
        -300,
        'matchId is required to build a publish QR payload',
      );
    }

    return {
      stream_url: `rtsp://${pushHost}:${pushPort}/live/${matchId}?key=${publishKey}`,
      match_id: matchId,
      match_title: input.matchTitle ?? '',
      protocol: 'rtsp',
      auto_start: input.autoStart ?? false,
    };
  }

  /**
   * Đọc endpoint push từ env MỚI (AQVISION_PUSH_HOST/AQVISION_PUSH_PORT).
   * Env có thể chưa tồn tại ⇒ mặc định rỗng ⇒ buildQrPayload sẽ fail-closed.
   */
  resolvePushEndpoint(): { pushHost: string; pushPort: string | number } {
    const pushHost = this.configService.get<string>('AQVISION_PUSH_HOST') ?? '';
    const pushPort =
      this.configService.get<string | number>('AQVISION_PUSH_PORT') ?? '';
    return { pushHost, pushPort };
  }

  /**
   * Ghép payload tiện lợi: lấy pushHost/pushPort từ ConfigService rồi gọi
   * buildQrPayload. Chưa cấu hình env push ⇒ ném lỗi (fail-closed).
   */
  buildQrPayloadFromConfig(input: {
    readonly matchId: string;
    readonly matchTitle: string;
    readonly publishKey: string;
    readonly autoStart?: boolean;
  }): AqvisionQrPayload {
    const { pushHost, pushPort } = this.resolvePushEndpoint();
    return this.buildQrPayload({ ...input, pushHost, pushPort });
  }

  /** Serialized payload — thứ tự field đúng theo khai báo của interface. */
  toQrPayloadString(payload: AqvisionQrPayload): string {
    return JSON.stringify(payload);
  }
}
