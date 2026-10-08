import { Injectable } from '@nestjs/common';
import { AqvisionApiClient } from './aqvision-api.client';

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
  constructor(private readonly aqvisionApiClient: AqvisionApiClient) {}

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
}
