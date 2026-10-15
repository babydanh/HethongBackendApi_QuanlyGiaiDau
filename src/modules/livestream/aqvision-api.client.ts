import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AqvisionAgencyApiClient,
  AqvisionAgencyApiException,
  resolveAqvisionAgencyBaseUrl,
} from './aqvision-agency-api.client';

/**
 * Nơi phát sinh lỗi, vì cùng một con số có thể đến từ nhiều chỗ:
 * - `config`: thiếu cấu hình phía mình (chưa gọi AQP lần nào).
 * - `http`: AQP/proxy trả HTTP không phải 2xx; `providerCode` là HTTP status.
 * - `transport`: không có phản hồi (mạng, timeout) sau mọi lần thử.
 * Không có `source`: AQP đã trả một envelope (`providerCode` là `code` của vendor,
 * kể cả khi trùng số với một HTTP status) hoặc phản hồi không đọc được.
 */
export type AqvisionFailureSource = 'config' | 'http' | 'transport';

/**
 * Lỗi từ lớp gọi API AQP (media server bên thứ ba — fork ZLMediaKit).
 * Mã lỗi giữ nguyên theo envelope vendor: -400/-300/-200/-100/-1.
 */
export class AqvisionApiException extends Error {
  constructor(
    public readonly providerCode: number,
    message: string,
    public readonly source?: AqvisionFailureSource,
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
 * Cách xác thực của một lời gọi AQP:
 * - `bearer` (mặc định khi có `AQVISION_AGENCY_ID`): AQP cấp MỘT khoá `SK_` cho đại lý; khoá đó đổi lấy JWT
 *   (cùng token tạo stream key) và JWT dùng cho MỌI lệnh, gửi trong header `Authorization` tới
 *   `media.aqvision.net/api/rapidmedia/<lệnh>`. KHÔNG có `secret`; `POST` gửi tham số trong body form
 *   (mẫu chính thức của AQP).
 * - `secret`: `secret=` trên URL `api.media.aqvision.net/index/api/<lệnh>` (theo `api.txt`), chỉ dùng khi
 *   KHÔNG cấu hình đại lý. Khoá `SK_` của đại lý bị đường này từ chối (`code -100 Incorrect secret`), nên
 *   khi đã có đại lý thì không gửi tới đây nữa.
 */
type AuthMode = 'secret' | 'bearer';

/** Nơi gửi và cách gửi của MỘT lần gọi: đường `secret` và đường `bearer` khác cả URL lẫn cách gửi tham số. */
interface AqvisionRequestTarget {
  readonly url: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

/**
 * Client server-side cho API AQP.
 *
 * Bất biến (INV-001 trong `00-problem-map.md`):
 * - Thiếu credential (không có token đại lý lẫn `secret`) ⇒ **fail-closed**, ném lỗi TRƯỚC khi dựng URL,
 *   không phát bất kỳ request nào ra ngoài.
 * - **Không bao giờ log URL/query string, token hay secret.** Chỉ log method + operation + mã lỗi.
 * - Envelope `{code, msg}`: chỉ `code === 0` là thành công (`-300` thiếu tham số,
 *   `-100` sai secret, `-400` exception, `-200` SQL, `-1` business fail).
 */
@Injectable()
export class AqvisionApiClient {
  private readonly logger = new Logger(AqvisionApiClient.name);

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly agencyTokens?: AqvisionAgencyApiClient,
  ) {}

  /**
   * Trạng thái online của stream.
   * - Đường `secret=` (quản trị viên): `GET /index/api/isMediaOnline`.
   * - Đường JWT đại lý: AQP chặn `isMediaOnline` (HTTP 403 "Administrator browser session required"),
   *   nên suy từ `isRecording`: máy media còn luồng (trả `status`, dù đang ghi hay không) ⇒ online;
   *   luồng/camera không tồn tại ⇒ offline.
   */
  async isMediaOnline(stream: string): Promise<IsMediaOnlineResult> {
    if (this.authMode() === 'bearer') {
      return { online: (await this.readRecordingState(stream)) !== 'absent' };
    }
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
    readonly enableHls?: boolean;
    readonly enableMp4?: boolean;
  }): Promise<{ proxyKey: string | null }> {
    const data = await this.call<{ key?: unknown }>('addStreamProxy', {
      stream: params.stream,
      url: params.url,
      enable_hls:
        params.enableHls === undefined ? undefined : Number(params.enableHls),
      enable_mp4:
        params.enableMp4 === undefined ? undefined : Number(params.enableMp4),
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
   * boolean ⇒ nem lỗi thay vì ép kiểu. Luồng/camera không tồn tại trên AQP ⇒ `false`
   * (không thể đang ghi một luồng không có), không phải lỗi.
   */
  async isRecordingMp4(stream: string): Promise<boolean> {
    const state = await this.readRecordingState(stream);
    return state === true;
  }

  /**
   * Hỏi `isRecording` (`type=1`). `'absent'` khi AQP trả lời rằng luồng không có mặt:
   * - máy media không có luồng (ZLMediaKit "can not find the stream": `code -500` trên đường `secret=`,
   *   HTTP 502 trên đường JWT) ⇒ camera đang không phát;
   * - đường JWT trả HTTP 404 "Camera not found" ⇒ tên luồng không thuộc camera nào của đại lý.
   * Đây là câu trả lời bình thường (trận đã xong, camera tắt) nên chỉ log debug. Lỗi khác vẫn ném như cũ.
   */
  private async readRecordingState(stream: string): Promise<boolean | 'absent'> {
    const response = await this.request('isRecording', { type: 1, stream }, {}, this.authMode());
    const payload = await this.parseJson(response);
    if (this.isStreamAbsent(response, payload)) {
      this.logger.debug(`AQP isRecording: luồng không có trên máy media (HTTP ${response.status}).`);
      return 'absent';
    }
    const data = this.unwrap<{ status?: unknown }>('isRecording', { response, payload });
    if (data.status !== true && data.status !== false) {
      throw new AqvisionApiException(
        -1,
        'Máy chủ media AQP trả trạng thái ghi MP4 không hợp lệ.',
      );
    }
    return data.status;
  }

  private isStreamAbsent(response: Response, payload: JsonObject): boolean {
    const reason = this.readHttpReason(payload).toLowerCase();
    if (reason.includes('can not find the stream')) {
      return response.status === 502 || (response.ok && this.readCode(payload) !== 0);
    }
    return response.status === 404 && reason.includes('camera not found');
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
      this.authMode(),
    );

    if (!response.ok) {
      throw new AqvisionApiException(
        response.status,
        `Máy chủ media AQP trả lỗi HTTP ${response.status}.`,
        'http',
      );
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new AqvisionApiException(-1, 'AQP không trả ảnh snapshot.');
    }

    return bytes;
  }

  /**
   * Gọi operation bất kỳ và bóc envelope; dùng cho các task T-005…T-009.
   * Một lần gọi duy nhất theo `authMode()`: không thử chéo giữa hai cách xác thực.
   */
  async call<T = JsonObject>(
    operation: string,
    params: Record<string, ParamValue> = {},
    options: AqvisionOperationOptions = {},
  ): Promise<T> {
    const response = await this.request(operation, params, options, this.authMode());
    return this.unwrap<T>(operation, { response, payload: await this.parseJson(response) });
  }

  /** Có đại lý (`AQVISION_AGENCY_ID` + client token) ⇒ JWT cho mọi lệnh; không có ⇒ `secret=`. */
  private authMode(): AuthMode {
    const agencyId = (this.configService.get<string>('AQVISION_AGENCY_ID') ?? '').trim();
    return this.agencyTokens && agencyId.length > 0 ? 'bearer' : 'secret';
  }

  private unwrap<T>(
    operation: string,
    { response, payload }: { response: Response; payload: JsonObject },
  ): T {
    if (!response.ok) {
      // Log tên operation + HTTP status + lý do AQP tự ghi trong body (error/msg/message, cắt ngắn):
      // body là lời AQP trả, không chứa URL/query/token của mình. KHÔNG log URL/query (chứa secret).
      const reason = this.readHttpReason(payload);
      this.logger.warn(
        `AQP ${operation} bị từ chối: HTTP ${response.status} (không phải mã lỗi của provider)${reason ? ` lý do="${reason}"` : ''}.`,
      );
      throw new AqvisionApiException(
        response.status,
        `Máy chủ media AQP trả lỗi HTTP ${response.status}.`,
        'http',
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
    auth: AuthMode,
  ): Promise<Response> {
    const method = options.method ?? OPERATION_METHODS[operation] ?? 'GET';
    // Fail-closed: credential và URL được dựng TRƯỚC khi gửi bất kỳ request nào.
    const target = await this.buildTarget(operation, params, options, auth, method);
    const attemptLimit = Math.max(
      1,
      options.retryAttempts ?? (method === 'GET' ? 3 : 1),
    );
    const timeoutMs = Math.max(
      1_000,
      options.timeoutMs ?? this.resolveTimeoutMs(),
    );

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(target.url, {
          method,
          headers: target.headers,
          ...(target.body === undefined ? {} : { body: target.body }),
          signal: controller.signal,
        });
        // 502 "can not find the stream" là câu trả lời (luồng không phát), không phải sự cố: không thử lại.
        if (
          response.status >= 500 &&
          attempt < attemptLimit &&
          !this.isStreamAbsent(response, await this.parseJson(response.clone()))
        ) {
          lastError = new AqvisionApiException(
            response.status,
            `Máy chủ media AQP trả lỗi HTTP ${response.status}.`,
            'http',
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
      : new AqvisionApiException(
          -1,
          'Máy chủ media AQP hiện không khả dụng.',
          'transport',
        );
  }

  private async buildTarget(
    operation: string,
    params: Record<string, ParamValue>,
    options: AqvisionOperationOptions,
    auth: AuthMode,
    method: AqvisionMethod,
  ): Promise<AqvisionRequestTarget> {
    const includeScopeParams = options.includeScopeParams !== false;

    if (auth === 'secret') {
      // Thiếu `secret=` ⇒ ném lỗi cấu hình trước khi dựng URL.
      const secret = this.resolveSecret(operation);
      return {
        url: `${this.resolveBaseUrl()}/index/api/${operation}?${this.buildQuery(params, secret, includeScopeParams)}`,
      };
    }

    if (!this.agencyTokens) {
      throw new AqvisionApiException(
        -100,
        'Tích hợp media AQP chưa được cấu hình.',
        'config',
      );
    }
    let origin: string;
    let token: string;
    try {
      // Kiểm tra origin TRƯỚC khi xin token: cấu hình sai thì token không bao giờ được cấp cho lời gọi này.
      origin = resolveAqvisionAgencyBaseUrl(this.configService);
      token = await this.agencyTokens.getBearerToken();
    } catch (error) {
      const failure = this.toBearerSetupError(error);
      // Chỉ tên thao tác và nhóm lỗi: KHÔNG log token, secret hay message gốc.
      this.logger.warn(
        `AQP ${operation}: chưa chuẩn bị được xác thực bằng token đại lý (${failure.source ?? 'auth'}).`,
      );
      throw failure;
    }
    const query = this.buildQuery(params, null, includeScopeParams);
    const url = `${origin}/api/rapidmedia/${operation}`;
    const headers = { Authorization: `Bearer ${token}` };

    return method === 'POST'
      ? {
          url,
          headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: query,
        }
      : { url: `${url}?${query}`, headers };
  }

  private resolveBaseUrl(): string {
    const configured = this.configService.get<string>('AQVISION_API_BASE_URL');
    return (configured ?? 'https://api.media.aqvision.net').replace(/\/+$/, '');
  }

  private resolveSecret(operation: string): string {
    const secret = (this.configService.get<string>('AQVISION_API_SECRET') ?? '').trim();

    if (secret.length === 0) {
      this.logger.warn(
        `AQP ${operation} bị chặn: AQVISION_API_SECRET chưa được cấu hình.`,
      );
      throw new AqvisionApiException(
        -100,
        'Tích hợp media AQP chưa được cấu hình.',
        'config',
      );
    }

    return secret;
  }

  /**
   * Lỗi khi chuẩn bị đường Bearer (cấu hình đại lý, xin token) ⇒ `AqvisionApiException` có `source`,
   * vì nơi gọi (`toRecordingCatalogError`, health check) chỉ nhận loại này. Message gốc không đi
   * tiếp: nó có thể nêu chi tiết cấu hình.
   */
  private toBearerSetupError(error: unknown): AqvisionApiException {
    if (error instanceof AqvisionAgencyApiException) {
      if (error.configuration) {
        return new AqvisionApiException(
          -100,
          'Tích hợp media AQP chưa được cấu hình.',
          'config',
        );
      }
      if (error.httpStatus === 401 || error.httpStatus === 403) {
        return new AqvisionApiException(-100, 'AQP từ chối khoá đại lý (code -100).');
      }
      if (error.httpStatus !== null) {
        return new AqvisionApiException(
          error.httpStatus,
          `Máy chủ media AQP trả lỗi HTTP ${error.httpStatus}.`,
          'http',
        );
      }
    }
    return new AqvisionApiException(
      -1,
      'Máy chủ media AQP hiện không khả dụng.',
      'transport',
    );
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
    secret: string | null,
    includeScopeParams: boolean,
  ): string {
    // Xác thực bằng Bearer thì `secret` là null: token đi trong header, KHÔNG đi trong URL.
    const search = new URLSearchParams(secret === null ? {} : { secret });

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

  /** Lý do AQP ghi kèm một phản hồi HTTP lỗi (`error`, `msg` hoặc `message`), một dòng, tối đa 160 ký tự. */
  private readHttpReason(payload: JsonObject): string {
    const raw = [payload.error, payload.msg, payload.message].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    return raw ? raw.replace(/\s+/g, ' ').trim().slice(0, 160) : '';
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
