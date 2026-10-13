import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AqvisionAgencyPushConfig {
  readonly rtmpServer: string;
  readonly streamKey: string;
}

export interface AqvisionAgencyStreamKey {
  readonly id: string;
  readonly app: string;
  readonly stream: string;
  readonly status: string;
  readonly push: AqvisionAgencyPushConfig | null;
}

export interface AqvisionAgencyDeleteResult {
  readonly keyRevoked: boolean;
  readonly disconnected: boolean;
}

export class AqvisionAgencyApiException extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null = null,
    readonly mayHaveApplied = false,
  ) {
    super(message);
    this.name = 'AqvisionAgencyApiException';
  }
}

type JsonObject = Record<string, unknown>;
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const API_VERSION_PATH = '/api/v1';
const TOKEN_REFRESH_MARGIN_MS = 60_000;

@Injectable()
export class AqvisionAgencyApiClient {
  private cachedToken: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(private readonly configService: ConfigService) {}

  async createStreamKey(input: {
    readonly app: string;
    readonly stream: string;
  }): Promise<AqvisionAgencyStreamKey> {
    return this.requestStreamKey('/stream-keys', 'POST', input, 201);
  }

  async listStreamKeys(): Promise<AqvisionAgencyStreamKey[]> {
    const data = await this.request('/stream-keys', 'GET', undefined, 200);
    if (!Array.isArray(data)) {
      throw new AqvisionAgencyApiException('Agency API trả về danh sách stream key không hợp lệ.');
    }
    return data.map((entry) => this.parseStreamKey(entry, false));
  }

  async getStreamKey(id: string): Promise<AqvisionAgencyStreamKey> {
    return this.requestStreamKey(`/stream-keys/${encodeURIComponent(id)}`, 'GET', undefined, 200);
  }

  async updateStreamKey(
    id: string,
    input: { readonly stream: string },
    method: 'PUT' | 'PATCH' = 'PATCH',
  ): Promise<AqvisionAgencyStreamKey> {
    const body = method === 'PUT' ? { app: 'live', ...input } : input;
    return this.requestStreamKey(
      `/stream-keys/${encodeURIComponent(id)}`,
      method,
      body,
      200,
    );
  }
  async rotateStreamKey(id: string): Promise<AqvisionAgencyStreamKey> {
    return this.requestStreamKey(
      `/stream-keys/${encodeURIComponent(id)}/rotate`,
      'POST',
      undefined,
      200,
    );
  }

  async deleteStreamKey(id: string): Promise<AqvisionAgencyDeleteResult> {
    const payload = await this.requestEnvelope(
      `/stream-keys/${encodeURIComponent(id)}`,
      'DELETE',
      undefined,
      200,
      true,
    );
    const data = this.readObject(payload.data) ?? payload;
    return {
      keyRevoked: data.keyRevoked === true,
      disconnected: data.disconnected === true,
    };
  }

  private async requestStreamKey(
    path: string,
    method: HttpMethod,
    body: unknown,
    expectedCode: number,
  ): Promise<AqvisionAgencyStreamKey> {
    const data = await this.request(path, method, body, expectedCode);
    try {
      return this.parseStreamKey(data, true);
    } catch (error) {
      if (method === 'GET' || !(error instanceof AqvisionAgencyApiException)) throw error;
      throw new AqvisionAgencyApiException(
        `Agency API ${method} ${path} returned an invalid stream key response.`,
        null,
        true,
      );
    }
  }

  private async request(
    path: string,
    method: HttpMethod,
    body: unknown,
    expectedCode: number,
  ): Promise<unknown> {
    const payload = await this.requestEnvelope(path, method, body, expectedCode);
    return payload.data;
  }

  private async requestEnvelope(
    path: string,
    method: HttpMethod,
    body: unknown,
    expectedCode: number,
    allowDeleteDisconnectPending = false,
  ): Promise<JsonObject> {
    const token = await this.getAccessToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.resolveTimeoutMs());

    try {
      const response = await fetch(`${this.resolveBaseUrl()}${API_VERSION_PATH}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: controller.signal,
      });
      const payload = await this.parseJson(response);
      const data = this.readObject(payload.data) ?? payload;

      if (
        allowDeleteDisconnectPending &&
        response.status === 503 &&
        data.keyRevoked === true &&
        data.disconnected === false
      ) {
        return payload;
      }

      if (!response.ok || Number(payload.code) !== expectedCode) {
        throw new AqvisionAgencyApiException(
          `Agency API ${method} ${path} thất bại (HTTP ${response.status}).`,
          response.status,
          method !== 'GET' && (response.status >= 500 || response.ok),
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof AqvisionAgencyApiException) throw error;
      throw new AqvisionAgencyApiException(
        `Không kết nối được Agency API khi gọi ${method} ${path}.`,
        null,
        method !== 'GET',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt - now > TOKEN_REFRESH_MARGIN_MS) {
      return this.cachedToken.value;
    }
    if (this.tokenRequest) return this.tokenRequest;

    this.tokenRequest = this.requestAccessToken();
    try {
      return await this.tokenRequest;
    } finally {
      this.tokenRequest = null;
    }
  }

  private async requestAccessToken(): Promise<string> {
    const agencyId = (this.configService.get<string>('AQVISION_AGENCY_ID') ?? '').trim();
    const apiSecret = (this.configService.get<string>('AQVISION_AGENCY_SECRET') ?? '').trim();
    if (!agencyId || !apiSecret) {
      throw new AqvisionAgencyApiException(
        'Tích hợp Agency API chưa được cấu hình trên máy chủ.',
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.resolveTimeoutMs());
    try {
      const response = await fetch(
        `${this.resolveBaseUrl()}${API_VERSION_PATH}/auth/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agency_id: agencyId, api_secret: apiSecret }),
          redirect: 'error',
          signal: controller.signal,
        },
      );
      const payload = await this.parseJson(response);
      const data = this.readObject(payload.data);
      const token = data?.token;
      const expiresAt = typeof data?.expiresAt === 'string' ? Date.parse(data.expiresAt) : NaN;
      if (
        !response.ok ||
        Number(payload.code) !== 200 ||
        typeof token !== 'string' ||
        token.length === 0 ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= Date.now()
      ) {
        throw new AqvisionAgencyApiException(
          `Agency API không cấp được access token (HTTP ${response.status}).`,
          response.status,
        );
      }
      this.cachedToken = { value: token, expiresAt };
      return token;
    } catch (error) {
      if (error instanceof AqvisionAgencyApiException) throw error;
      throw new AqvisionAgencyApiException('Không lấy được access token từ Agency API.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseStreamKey(value: unknown, includePush: boolean): AqvisionAgencyStreamKey {
    const data = this.readObject(value);
    const id = data?.id;
    const app = data?.app;
    const stream = data?.stream;
    const status = data?.status;
    const rawPush = data?.push;
    let push: AqvisionAgencyPushConfig | null = null;

    if (rawPush !== null && rawPush !== undefined) {
      const pushData = this.readObject(rawPush);
      const rtmpServer = pushData?.rtmpServer;
      const streamKey = pushData?.streamKey;
      if (
        typeof rtmpServer !== 'string' ||
        !rtmpServer.trim() ||
        typeof streamKey !== 'string' ||
        !streamKey.trim()
      ) {
        throw new AqvisionAgencyApiException('Agency API trả về cấu hình RTMP không hợp lệ.');
      }
      push = { rtmpServer: rtmpServer.trim(), streamKey: streamKey.trim() };
    }

    if (
      typeof id !== 'string' ||
      !id ||
      typeof app !== 'string' ||
      !app ||
      typeof stream !== 'string' ||
      !stream ||
      typeof status !== 'string' ||
      !status ||
      (includePush && rawPush === undefined)
    ) {
      throw new AqvisionAgencyApiException('Agency API trả về stream key không hợp lệ.');
    }

    return { id, app, stream, status, push };
  }

  private async parseJson(response: Response): Promise<JsonObject> {
    const payload: unknown = await response.json().catch(() => ({}));
    return this.readObject(payload) ?? {};
  }

  private readObject(value: unknown): JsonObject | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as JsonObject)
      : null;
  }

  private resolveBaseUrl(): string {
    const configuredUrl = this.configService
      .get<string>('AQVISION_AGENCY_BASE_URL', 'https://media.aqvision.net')
      .trim();
    let url: URL;
    try {
      url = new URL(configuredUrl);
    } catch {
      throw new AqvisionAgencyApiException('Cấu hình Agency API base URL không hợp lệ.');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new AqvisionAgencyApiException('Agency API base URL phải là origin HTTPS hợp lệ.');
    }
    return url.origin;
  }

  private resolveTimeoutMs(): number {
    const seconds = Number(
      this.configService.get<number>('AQVISION_API_TIMEOUT_SECONDS', 10),
    );
    return Math.max(1, Math.min(Number.isFinite(seconds) ? seconds : 10, 60)) * 1000;
  }
}
