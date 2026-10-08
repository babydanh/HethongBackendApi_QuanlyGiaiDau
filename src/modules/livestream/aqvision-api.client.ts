import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Lỗi từ lớp gọi API AQP (media server bên thứ ba — fork ZLMediaKit).
 * Mã lỗi giữ nguyên theo envelope vendor: -400/-300/-200/-100/-1.
 */
export class AqvisionApiException extends Error {
  constructor(
    public readonly providerCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AqvisionApiException';
  }
}

export type AqvisionMethod = 'GET' | 'POST';

export interface AqvisionOperationOptions {
  readonly method?: AqvisionMethod;
  readonly retryAttempts?: number;
  readonly timeoutMs?: number;
  /**
   * `false` ⇒ KHÔNG gửi `vhost`/`app` (mặc định `true`).
   * `getSnap` là endpoint duy nhất không nhận `vhost`/`app`/`stream` (vendor `api.txt`).
   */
  readonly includeScopeParams?: boolean;
}

export interface IsMediaOnlineResult {
  readonly online: boolean;
}

export interface GetMp4RecordFileResult {
  /** Bỏ trống `period` ⇒ tên thư mục ngày; có `period` ⇒ tên file trong ngày. */
  readonly paths: string[];
  readonly rootPath: string;
  /** Chỉ có khi gọi `with_size=1`. */
  readonly files?: { name: string; sizeBytes: number }[];
}

export interface GetMp4RecordFileParams {
  readonly stream: string;
  /** `YYYY-MM-DD`; bỏ trống để liệt kê thư mục ngày. */
  readonly period?: string;
  readonly withSize?: boolean;
  readonly customizedPath?: string;
}

export interface GetSnapParams {
  readonly url: string;
  readonly timeoutSec: number;
  readonly expireSec: number;
}

/** Operation có tham số qua query string, kể cả POST (theo mẫu vendor `api.txt`). */
const OPERATION_METHODS: Record<string, AqvisionMethod> = {
  getMediaList: 'GET',
  getMediaInfo: 'GET',
  isMediaOnline: 'GET',
  addStreamProxy: 'POST',
  listStreamProxy: 'GET',
  delStreamProxy: 'POST',
  startRecord: 'POST',
  isRecording: 'GET',
  stopRecord: 'POST',
  getMP4RecordFile: 'GET',
  getSnap: 'GET',
};

type JsonObject = Record<string, unknown>;
type ParamValue = string | number | boolean | undefined;

/**
 * Client server-side cho API AQP.
 *
 * Bất biến (INV-001 trong `00-problem-map.md`):
 * - `secret` là bắt buộc; thiếu secret ⇒ **fail-closed**, ném lỗi TRƯỚC khi dựng URL,
 *   không phát bất kỳ request nào ra ngoài.
 * - **Không bao giờ log URL/query string** (chứa `secret`). Chỉ log method + operation + mã lỗi.
 * - Envelope `{code, msg}`: chỉ `code === 0` là thành công (`-300` thiếu tham số,
 *   `-100` sai secret, `-400` exception, `-200` SQL, `-1` business fail).
 */
@Injectable()
export class AqvisionApiClient {
  private readonly logger = new Logger(AqvisionApiClient.name);

  constructor(private readonly configService: ConfigService) {}

  /** `GET /index/api/isMediaOnline` — trạng thái online của stream. */
  async isMediaOnline(stream: string): Promise<IsMediaOnlineResult> {
    const data = await this.call<{ online?: unknown }>(
      'isMediaOnline',
      { schema: this.resolveSchema(), stream },
    );
    return { online: data.online === true };
  }

  /**
   * `POST /index/api/addStreamProxy` — nhờ AQP KÉO luồng từ `url`
   * (RTSP/RTMP/HLS) về và phát lại từ server AQP.
   *
   * Đây là chiều ngược với PUSH: không cần publish key, vì AQP là bên chủ động
   * kết nối tới camera. AQP trả về khoá proxy nội bộ (`data.key`) — khoá này
   * KHÔNG phải credential publish, chỉ dùng để ngắt proxy về sau.
   */
  async addStreamProxy(params: {
    readonly stream: string;
    readonly url: string;
  }): Promise<{ proxyKey: string | null }> {
    const data = await this.call<{ key?: unknown }>('addStreamProxy', {
      stream: params.stream,
      url: params.url,
    });

    return {
      proxyKey:
        typeof data.key === 'string' && data.key.length > 0 ? data.key : null,
    };
  }

  /**
   * `POST /index/api/delStreamProxy` — ngắt proxy kéo luồng theo khoá đã lưu.
   * Không có bước này thì AQP vẫn kéo luồng của camera đã bị xoá khỏi SportO.
   */
  async delStreamProxy(proxyKey: string): Promise<void> {
    await this.call('delStreamProxy', { key: proxyKey });
  }

  /** `GET /index/api/getMP4RecordFile` — duyệt bản ghi MP4 (2 bước khi cần tên file). */
  async getMp4RecordFile(
    params: GetMp4RecordFileParams,
  ): Promise<GetMp4RecordFileResult> {
    const data = await this.call<{
      paths?: unknown;
      rootPath?: unknown;
      data_files?: unknown;
    }>('getMP4RecordFile', {
      stream: params.stream,
      period: params.period,
      with_size: params.withSize === true ? 1 : undefined,
      customized_path: params.customizedPath,
    });

    return {
      paths: Array.isArray(data.paths)
        ? data.paths.filter((entry): entry is string => typeof entry === 'string')
        : [],
      rootPath: typeof data.rootPath === 'string' ? data.rootPath : '',
      files: this.parseDataFiles(data.data_files),
    };
  }

  /**
   * `POST /index/api/startRecord` — bắt đầu ghi MP4 (`type=1`) cho `stream`.
   * Chỉ thành công khi AQP xác nhận `result: true` (boolean).
   */
  async startRecordMp4(stream: string): Promise<void> {
    const data = await this.call<{ result?: unknown }>('startRecord', {
      type: 1,
      stream,
    });
    this.assertRecordWriteResult('startRecord', data);
  }

  /**
   * `GET /index/api/isRecording` — `stream` có đang ghi MP4 (`type=1`)?
   * Chỉ literal boolean `status: true` mới là true; `status` không phải
   * boolean ⇒ nem lỗi thay vì ép kiểu.
   */
  async isRecordingMp4(stream: string): Promise<boolean> {
    const data = await this.call<{ status?: unknown }>('isRecording', {
      type: 1,
      stream,
    });
    if (data.status !== true && data.status !== false) {
      throw new AqvisionApiException(
        -1,
        'Máy chủ media AQP trả trạng thái ghi MP4 không hợp lệ.',
      );
    }
    return data.status;
  }

  /**
   * `POST /index/api/stopRecord` — dừng ghi MP4 (`type=1`) cho `stream`.
   * Chỉ thành công khi AQP xác nhận `result: true` (boolean).
   */
  async stopRecordMp4(stream: string): Promise<void> {
    const data = await this.call<{ result?: unknown }>('stopRecord', {
      type: 1,
      stream,
    });
    this.assertRecordWriteResult('stopRecord', data);
  }

  /**
   * `GET /index/api/getSnap` — trả **JPEG nhị phân**, KHÔNG đi qua envelope JSON.
   * Vendor sample: `url` + `timeout_sec` + `expire_sec` (không có `vhost`/`app`/`stream`).
   */
  async getSnap(params: GetSnapParams): Promise<Buffer> {
    const response = await this.request(
      'getSnap',
      {
        url: params.url,
        timeout_sec: params.timeoutSec,
        expire_sec: params.expireSec,
      },
      { retryAttempts: 2, includeScopeParams: false },
    );

    if (!response.ok) {
      throw new AqvisionApiException(
        response.status,
        `Máy chủ media AQP trả lỗi HTTP ${response.status}.`,
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new AqvisionApiException(-1, 'AQP không trả ảnh snapshot.');
    }

    return bytes;
  }

  /** Gọi operation bất kỳ và bóc envelope; dùng cho các task T-005…T-009. */
  async call<T = JsonObject>(
    operation: string,
    params: Record<string, ParamValue> = {},
    options: AqvisionOperationOptions = {},
  ): Promise<T> {
    const response = await this.request(operation, params, options);
    const payload = await this.parseJson(response);

    if (!response.ok) {
      throw new AqvisionApiException(
        response.status,
        `Máy chủ media AQP trả lỗi HTTP ${response.status}.`,
      );
    }

    const code = this.readCode(payload);
    if (code !== 0) {
      // Chỉ log mã lỗi + message từ provider, KHÔNG log URL.
      this.logger.warn(
        `AQP ${operation} bị từ chối: code=${code} msg=${this.readMessage(payload)}`,
      );
      throw new AqvisionApiException(
        code,
        `Máy chủ media AQP từ chối yêu cầu (code ${code}).`,
      );
    }

    return (payload.data ?? payload) as T;
  }

  private async request(
    operation: string,
    params: Record<string, ParamValue>,
    options: AqvisionOperationOptions,
  ): Promise<Response> {
    // Fail-closed: đọc secret TRƯỚC khi dựng URL.
    const secret = this.resolveSecret(operation);
    const baseUrl = this.resolveBaseUrl();
    const method = options.method ?? OPERATION_METHODS[operation] ?? 'GET';
    const attemptLimit = Math.max(
      1,
      options.retryAttempts ?? (method === 'GET' ? 3 : 1),
    );
    const timeoutMs = Math.max(
      1_000,
      options.timeoutMs ?? this.resolveTimeoutMs(),
    );
    const url = `${baseUrl}/index/api/${operation}?${this.buildQuery(params, secret, options.includeScopeParams !== false)}`;

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { method, signal: controller.signal });
        if (response.status >= 500 && attempt < attemptLimit) {
          lastError = new AqvisionApiException(
            response.status,
            `Máy chủ media AQP trả lỗi HTTP ${response.status}.`,
          );
          continue;
        }
        return response;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }

      if (attempt < attemptLimit) {
        // Không log URL: query chứa secret.
        this.logger.warn(
          `AQP ${operation} (${method}) thử lần ${attempt} thất bại; thử lại.`,
        );
        await this.waitForRetry(attempt);
      }
    }

    this.logger.warn(
      `AQP ${operation} (${method}) không phản hồi sau ${attemptLimit} lần thử.`,
    );
    throw lastError instanceof AqvisionApiException
      ? lastError
      : new AqvisionApiException(-1, 'Máy chủ media AQP hiện không khả dụng.');
  }

  private resolveBaseUrl(): string {
    const configured = this.configService.get<string>('AQVISION_API_BASE_URL');
    return (configured ?? 'https://api.media.aqvision.net').replace(/\/+$/, '');
  }

  private resolveSecret(operation: string): string {
    const secret = (
      this.configService.get<string>('AQVISION_API_SECRET') ?? ''
    ).trim();

    if (secret.length === 0) {
      this.logger.warn(
        `AQP ${operation} bị chặn: AQVISION_API_SECRET chưa được cấu hình.`,
      );
      throw new AqvisionApiException(
        -100,
        'Tích hợp media AQP chưa được cấu hình.',
      );
    }

    return secret;
  }

  /** `schema` bắt buộc theo vendor nhưng đã lỗi thời ⇒ để cấu hình được, không hardcode. */
  private resolveSchema(): string {
    return this.configService.get<string>('AQVISION_MEDIA_SCHEMA') ?? 'rtsp';
  }

  private resolveTimeoutMs(): number {
    const seconds = this.configService.get<number>(
      'AQVISION_API_TIMEOUT_SECONDS',
      10,
    );
    return Math.max(1, Math.min(Number(seconds) || 10, 60)) * 1000;
  }

  private buildQuery(
    params: Record<string, ParamValue>,
    secret: string,
    includeScopeParams: boolean,
  ): string {
    const search = new URLSearchParams({ secret });

    if (includeScopeParams) {
      search.set(
        'vhost',
        this.configService.get<string>('AQVISION_VHOST') ?? '__defaultVhost__',
      );
      search.set('app', this.configService.get<string>('AQVISION_APP') ?? 'live');
    }

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) {
        continue;
      }
      search.set(key, String(value));
    }

    return search.toString();
  }

  private readCode(payload: JsonObject): number {
    const parsed = Number(payload.code);
    return Number.isFinite(parsed) ? parsed : -1;
  }

  private readMessage(payload: JsonObject): string {
    return typeof payload.msg === 'string' ? payload.msg : 'không xác định';
  }

  /** Write op chỉ thành công khi AQP xác nhận `result: true` (boolean). */
  private assertRecordWriteResult(
    operation: string,
    data: { result?: unknown },
  ): void {
    if (data.result !== true) {
      // Sanitized: chỉ tên operation, KHÔNG log URL/query (chứa secret).
      throw new AqvisionApiException(
        -1,
        `Máy chủ media AQP không xác nhận thao tác ghi MP4 (${operation}).`,
      );
    }
  }

  private parseDataFiles(
    raw: unknown,
  ): { name: string; sizeBytes: number }[] | undefined {
    if (!Array.isArray(raw)) {
      return undefined;
    }

    return raw.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      const name = record.name;
      const sizeBytes = Number(record.sizeBytes);
      return typeof name === 'string' && Number.isFinite(sizeBytes)
        ? [{ name, sizeBytes }]
        : [];
    });
  }

  private async parseJson(response: Response): Promise<JsonObject> {
    const payload: unknown = await response.json().catch(() => ({}));
    return typeof payload === 'object' && payload !== null
      ? (payload as JsonObject)
      : {};
  }

  private async waitForRetry(attempt: number): Promise<void> {
    const delayMs = Math.min(1_000, 250 * 2 ** (attempt - 1));
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }
}
