import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LiveSessionRepository,
  type FacebookPageConnectionRow,
} from './live-session.repository';
import { FacebookTokenCryptoService } from './facebook-token-crypto.service';
import type { LivestreamFailureCode } from './livestream-contracts';

export class FacebookLiveProviderException extends Error {
  constructor(
    public readonly failureCode: LivestreamFailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'FacebookLiveProviderException';
  }
}

export interface FacebookPublishConfig {
  readonly publishUrl: string;
  readonly expiresAt: Date;
}

export interface FacebookLiveVideoCreation {
  readonly providerSessionId: string;
  readonly publishConfig: FacebookPublishConfig;
}

export interface FacebookLiveVideoStatus {
  readonly providerSessionId: string;
  readonly providerStatus: string | null;
  readonly isLive: boolean;
  readonly replayUrl: string | null;
}

export interface FacebookReplayMetadata {
  readonly replayUrl: string | null;
}

type JsonObject = Record<string, unknown>;

@Injectable()
export class FacebookLiveService {
  constructor(
    private readonly liveSessionRepository: LiveSessionRepository,
    private readonly tokenCrypto: FacebookTokenCryptoService,
    private readonly configService: ConfigService,
  ) {}

  async validatePageConnection(
    connectionId: string,
  ): Promise<FacebookPageConnectionRow> {
    const connection = await this.getConnection(connectionId);
    const token = this.decryptToken(connection);

    if (!connection.scopes.includes('publish_video')) {
      await this.liveSessionRepository.updateFacebookPageConnection(
        connection.id,
        {
          status: 'REVOKED',
          lastValidatedAt: new Date(),
        },
      );
      throw new FacebookLiveProviderException(
        'FACEBOOK_PERMISSION_MISSING',
        'Facebook Page chưa được cấp quyền phát video.',
      );
    }

    const payload = await this.requestGraph(
      `/${encodeURIComponent(connection.pageId)}?fields=id,name`,
      token,
      'GET',
    );
    const pageId = this.readString(payload, 'id');
    if (pageId !== connection.pageId) {
      await this.liveSessionRepository.updateFacebookPageConnection(
        connection.id,
        {
          status: 'REVOKED',
          lastValidatedAt: new Date(),
        },
      );
      throw new FacebookLiveProviderException(
        'FACEBOOK_CONNECTION_EXPIRED',
        'Kết nối Facebook Page không còn hợp lệ.',
      );
    }

    const validated =
      await this.liveSessionRepository.updateFacebookPageConnection(
        connection.id,
        {
          status: 'ACTIVE',
          lastValidatedAt: new Date(),
        },
      );

    return (
      validated ?? {
        ...connection,
        status: 'ACTIVE',
        lastValidatedAt: new Date(),
      }
    );
  }

  async createLiveVideo(
    pageConnectionId: string,
    title: string,
    description: string | null,
  ): Promise<FacebookLiveVideoCreation> {
    const connection = await this.getConnection(pageConnectionId);
    this.assertConnectionCanPublish(connection);
    const token = this.decryptToken(connection);
    const body = new URLSearchParams({
      status: 'LIVE_NOW',
      title,
    });
    if (description) {
      body.set('description', description);
    }

    const payload = await this.requestGraph(
      `/${encodeURIComponent(connection.pageId)}/live_videos`,
      token,
      'POST',
      body,
    );
    const providerSessionId = this.readString(payload, 'id');
    const publishUrl = this.readString(payload, 'secure_stream_url');

    if (!providerSessionId || !publishUrl) {
      throw new FacebookLiveProviderException(
        'PROVIDER_UNAVAILABLE',
        'Facebook không trả về cấu hình phát video hợp lệ.',
      );
    }

    return {
      providerSessionId,
      publishConfig: {
        publishUrl,
        expiresAt: new Date(Date.now() + this.getPublishConfigTtlMs()),
      },
    };
  }

  async getLiveVideoStatus(
    pageConnectionId: string,
    providerSessionId: string,
  ): Promise<FacebookLiveVideoStatus> {
    const connection = await this.getConnection(pageConnectionId);
    this.assertConnectionCanPublish(connection);
    const token = this.decryptToken(connection);
    const payload = await this.requestGraph(
      `/${encodeURIComponent(providerSessionId)}?fields=id,status,permalink_url`,
      token,
      'GET',
    );
    const providerStatus = this.readString(payload, 'status');
    const replayUrl = this.readString(payload, 'permalink_url');

    return {
      providerSessionId,
      providerStatus,
      isLive: providerStatus === 'LIVE',
      replayUrl,
    };
  }

  async endLiveVideo(
    pageConnectionId: string,
    providerSessionId: string,
  ): Promise<void> {
    const connection = await this.getConnection(pageConnectionId);
    this.assertConnectionCanPublish(connection);
    const token = this.decryptToken(connection);
    const body = new URLSearchParams({
      end_live_video: 'true',
    });

    await this.requestGraph(
      `/${encodeURIComponent(providerSessionId)}`,
      token,
      'POST',
      body,
    );
  }

  async getReplayMetadata(
    pageConnectionId: string,
    providerSessionId: string,
  ): Promise<FacebookReplayMetadata> {
    const connection = await this.getConnection(pageConnectionId);
    const token = this.decryptToken(connection);
    const payload = await this.requestGraph(
      `/${encodeURIComponent(providerSessionId)}?fields=id,permalink_url`,
      token,
      'GET',
    );

    return { replayUrl: this.readString(payload, 'permalink_url') };
  }

  private async getConnection(
    connectionId: string,
  ): Promise<FacebookPageConnectionRow> {
    const connection =
      await this.liveSessionRepository.findFacebookPageConnectionById(
        connectionId,
      );
    if (!connection) {
      throw new NotFoundException('Kết nối Facebook Page không tồn tại.');
    }
    return connection;
  }

  private assertConnectionCanPublish(
    connection: FacebookPageConnectionRow,
  ): void {
    if (connection.status === 'EXPIRED') {
      throw new FacebookLiveProviderException(
        'FACEBOOK_CONNECTION_EXPIRED',
        'Kết nối Facebook cần được xác thực lại.',
      );
    }
    if (connection.status !== 'ACTIVE') {
      throw new FacebookLiveProviderException(
        'FACEBOOK_NOT_CONNECTED',
        'Chưa có Facebook Page đang hoạt động.',
      );
    }
    if (!connection.scopes.includes('publish_video')) {
      throw new FacebookLiveProviderException(
        'FACEBOOK_PERMISSION_MISSING',
        'Facebook Page chưa được cấp quyền phát video.',
      );
    }
  }

  private decryptToken(connection: FacebookPageConnectionRow): string {
    try {
      return this.tokenCrypto.decrypt(connection.encryptedPageToken);
    } catch {
      throw new FacebookLiveProviderException(
        'FACEBOOK_CONNECTION_EXPIRED',
        'Kết nối Facebook cần được thiết lập lại.',
      );
    }
  }

  private async requestGraph(
    path: string,
    token: string,
    method: 'GET' | 'POST',
    body?: URLSearchParams,
  ): Promise<JsonObject> {
    const baseUrl = this.configService
      .get<string>('FACEBOOK_GRAPH_API_BASE_URL', 'https://graph.facebook.com')
      .replace(/\/$/, '');
    const apiVersion = this.configService.get<string>(
      'FACEBOOK_GRAPH_API_VERSION',
      'v23.0',
    );
    const url = `${baseUrl}/${apiVersion}${path}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
    };
    if (body) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
    }

    const maxAttempts =
      method === 'GET'
        ? this.configService.get<number>('FACEBOOK_GRAPH_GET_RETRY_ATTEMPTS', 3)
        : 1;
    const timeoutMs = this.configService.get<number>(
      'FACEBOOK_GRAPH_REQUEST_TIMEOUT_MS',
      10000,
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });
        const payload = await this.parseJson(response);
        if (!response.ok) {
          if (response.status >= 500 && attempt < maxAttempts) {
            await this.waitForRetry(attempt);
            continue;
          }
          throw this.mapProviderError(response.status, payload);
        }
        return payload;
      } catch (error) {
        if (error instanceof FacebookLiveProviderException) {
          throw error;
        }
        if (attempt < maxAttempts) {
          await this.waitForRetry(attempt);
          continue;
        }
        throw new ServiceUnavailableException('Facebook hiện không khả dụng.');
      } finally {
        clearTimeout(timeoutHandle);
      }
    }

    throw new ServiceUnavailableException('Facebook hiện không khả dụng.');
  }

  private async waitForRetry(attempt: number): Promise<void> {
    const delayMs = Math.min(1000, 250 * 2 ** (attempt - 1));
    await new Promise<void>((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  private async parseJson(response: Response): Promise<JsonObject> {
    const payload: unknown = await response.json().catch(() => ({}));
    return this.isJsonObject(payload) ? payload : {};
  }

  private mapProviderError(
    status: number,
    payload: JsonObject,
  ): FacebookLiveProviderException {
    const error = this.isJsonObject(payload.error) ? payload.error : {};
    const providerCode = this.readString(error, 'code');
    if (status === 401 || providerCode === '190') {
      return new FacebookLiveProviderException(
        'FACEBOOK_CONNECTION_EXPIRED',
        'Kết nối Facebook cần được xác thực lại.',
      );
    }
    if (status === 403 || providerCode === '200' || providerCode === '10') {
      return new FacebookLiveProviderException(
        'FACEBOOK_PERMISSION_MISSING',
        'Facebook Page chưa được cấp quyền phát video.',
      );
    }
    return new FacebookLiveProviderException(
      'UNKNOWN_PROVIDER_ERROR',
      'Facebook không thể xử lý yêu cầu livestream.',
    );
  }

  private getPublishConfigTtlMs(): number {
    const seconds = this.configService.get<number>(
      'FACEBOOK_PUBLISH_CONFIG_TTL_SECONDS',
      900,
    );
    return Math.max(60, Math.min(seconds, 3600)) * 1000;
  }

  private readString(value: JsonObject, key: string): string | null {
    const candidate = value[key];
    return typeof candidate === 'string' && candidate.length > 0
      ? candidate
      : null;
  }

  private isJsonObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
