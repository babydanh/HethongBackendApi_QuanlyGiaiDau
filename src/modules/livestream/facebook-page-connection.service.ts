import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RedisService } from '../../providers/redis/redis.service';
import {
  LiveSessionRepository,
  type FacebookPageConnectionRow,
} from './live-session.repository';
import {
  FacebookLiveProviderException,
  FacebookLiveService,
} from './facebook-live.service';
import { FacebookTokenCryptoService } from './facebook-token-crypto.service';

interface OAuthStatePayload {
  readonly communityId: string;
  readonly userId: string;
  readonly issuedAt: number;
  readonly nonce: string;
}

interface FacebookPage {
  readonly id: string;
  readonly name: string;
  readonly access_token: string;
  readonly tasks?: readonly string[];
}

interface FacebookPagesResponse extends Record<string, unknown> {
  readonly data?: readonly FacebookPage[];
}

interface FacebookPermission {
  readonly permission?: string;
  readonly status?: string;
}

interface FacebookPermissionsResponse extends Record<string, unknown> {
  readonly data?: FacebookPermission[];
}

export interface PublicFacebookPageConnection {
  readonly id: string;
  readonly communityId: string;
  readonly pageId: string;
  readonly pageName: string;
  readonly status: string;
  readonly scopes: readonly string[];
  readonly connectedBy: string | null;
  readonly connectedAt: Date;
  readonly lastValidatedAt: Date | null;
  readonly updatedAt: Date;
}

export interface FacebookOAuthStartResult {
  readonly authorizationUrl: string;
  readonly stateExpiresAt: Date;
}

@Injectable()
export class FacebookPageConnectionService {
  constructor(
    private readonly repository: LiveSessionRepository,
    private readonly facebookLiveService: FacebookLiveService,
    private readonly tokenCrypto: FacebookTokenCryptoService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async getConnection(
    communityId: string,
    user: JwtPayload,
  ): Promise<PublicFacebookPageConnection | null> {
    await this.assertCommunityManager(communityId, user);
    const connection =
      await this.repository.findFacebookPageConnectionByCommunityId(
        communityId,
      );
    return connection ? this.toPublicConnection(connection) : null;
  }

  async createOAuthStart(
    communityId: string,
    user: JwtPayload,
  ): Promise<FacebookOAuthStartResult> {
    await this.assertCommunityManager(communityId, user);
    this.assertOAuthConfiguration();
    const now = Date.now();
    const state: OAuthStatePayload = {
      communityId,
      userId: user.sub,
      issuedAt: now,
      nonce: randomBytes(32).toString('base64url'),
    };
    await this.redisService.set(this.oauthStateKey(state.nonce), '1', 600);
    const serializedState = this.tokenCrypto.encrypt(JSON.stringify(state));
    const version = this.configService.get<string>(
      'FACEBOOK_GRAPH_API_VERSION',
      'v23.0',
    );
    const appId = this.configService.get<string>('FACEBOOK_APP_ID', '');
    const redirectUri = this.configService.get<string>(
      'FACEBOOK_OAUTH_REDIRECT_URI',
      '',
    );
    const authorizationUrl = new URL(
      `https://www.facebook.com/${version}/dialog/oauth`,
    );
    authorizationUrl.searchParams.set('client_id', appId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('state', serializedState);
    authorizationUrl.searchParams.set(
      'scope',
      'pages_show_list,pages_read_engagement,publish_video',
    );

    return {
      authorizationUrl: authorizationUrl.toString(),
      stateExpiresAt: new Date(now + 10 * 60 * 1000),
    };
  }

  async completeOAuth(
    code: string,
    state: string,
  ): Promise<PublicFacebookPageConnection> {
    this.assertOAuthConfiguration();
    const statePayload = await this.readOAuthState(state);
    const userAccessToken = await this.exchangeCode(code);
    const permissions = await this.getGrantedPermissions(userAccessToken);
    const pages = await this.listPages(userAccessToken);
    const selectedPage =
      pages.find((page) => page.tasks?.includes('CREATE_CONTENT')) ?? pages[0];
    if (!selectedPage) {
      throw new FacebookLiveProviderException(
        'FACEBOOK_NOT_CONNECTED',
        'Tài khoản Facebook chưa có Page phù hợp để phát livestream.',
      );
    }

    const scopes = [...permissions];
    const encryptedPageToken = this.tokenCrypto.encrypt(
      selectedPage.access_token,
    );
    await this.repository.disconnectFacebookPageConnectionsForCommunity(
      statePayload.communityId,
    );
    const existing =
      await this.repository.findFacebookPageConnectionByCommunityId(
        statePayload.communityId,
      );
    const connection = existing
      ? await this.repository.updateFacebookPageConnection(existing.id, {
          pageId: selectedPage.id,
          pageName: selectedPage.name,
          encryptedPageToken,
          scopes,
          status: 'ACTIVE',
          lastValidatedAt: null,
        })
      : await this.repository.createFacebookPageConnection({
          communityId: statePayload.communityId,
          pageId: selectedPage.id,
          pageName: selectedPage.name,
          encryptedPageToken,
          connectedBy: statePayload.userId,
          scopes,
          status: 'ACTIVE',
        });

    if (!connection) {
      throw new ServiceUnavailableException(
        'Không thể lưu kết nối Facebook Page.',
      );
    }
    return this.toPublicConnection(connection);
  }

  async validateConnection(
    connectionId: string,
    user: JwtPayload,
  ): Promise<PublicFacebookPageConnection> {
    const connection = await this.getConnectionForManager(connectionId, user);
    const validated = await this.facebookLiveService.validatePageConnection(
      connection.id,
    );
    return this.toPublicConnection(validated);
  }

  async disconnectConnection(
    communityId: string,
    user: JwtPayload,
  ): Promise<PublicFacebookPageConnection | null> {
    await this.assertCommunityManager(communityId, user);
    const connection =
      await this.repository.findFacebookPageConnectionByCommunityId(
        communityId,
      );
    if (!connection) {
      return null;
    }
    const disconnected = await this.repository.updateFacebookPageConnection(
      connection.id,
      {
        status: 'DISCONNECTED',
      },
    );
    return disconnected ? this.toPublicConnection(disconnected) : null;
  }

  private async getConnectionForManager(
    connectionId: string,
    user: JwtPayload,
  ): Promise<FacebookPageConnectionRow> {
    const connection =
      await this.repository.findFacebookPageConnectionById(connectionId);
    if (!connection) {
      throw new NotFoundException('Kết nối Facebook Page không tồn tại.');
    }
    await this.assertCommunityManager(connection.communityId, user);
    return connection;
  }

  private async assertCommunityManager(
    communityId: string,
    user: JwtPayload,
  ): Promise<void> {
    if (user.roles?.includes('ADMIN') === true || user.role === 'ADMIN') {
      return;
    }
    if (
      !(await this.repository.hasCommunityManagerAccess(communityId, user.sub))
    ) {
      throw new ForbiddenException(
        'Bạn không có quyền quản lý Facebook Page của cộng đồng này.',
      );
    }
  }

  private assertOAuthConfiguration(): void {
    const appId = this.configService.get<string>('FACEBOOK_APP_ID', '');
    const appSecret = this.configService.get<string>('FACEBOOK_APP_SECRET', '');
    const redirectUri = this.configService.get<string>(
      'FACEBOOK_OAUTH_REDIRECT_URI',
      '',
    );
    if (!appId || !appSecret || !redirectUri) {
      throw new ServiceUnavailableException(
        'Facebook OAuth chưa được cấu hình.',
      );
    }
  }

  private async readOAuthState(
    serializedState: string,
  ): Promise<OAuthStatePayload> {
    let payload: unknown;
    try {
      payload = JSON.parse(
        this.tokenCrypto.decrypt(serializedState),
      ) as unknown;
    } catch {
      throw new BadRequestException({
        code: 'FACEBOOK_OAUTH_STATE_INVALID',
        message: 'Phiên kết nối Facebook không hợp lệ hoặc đã hết hạn.',
      });
    }
    if (
      !isOAuthStatePayload(payload) ||
      Date.now() - payload.issuedAt > 10 * 60 * 1000
    ) {
      throw new BadRequestException({
        code: 'FACEBOOK_OAUTH_STATE_INVALID',
        message: 'Phiên kết nối Facebook không hợp lệ hoặc đã hết hạn.',
      });
    }
    const consumed = await this.consumeOAuthNonce(payload.nonce);
    if (!consumed) {
      throw new BadRequestException({
        code: 'FACEBOOK_OAUTH_STATE_INVALID',
        message: 'Phiên kết nối Facebook không hợp lệ hoặc đã được sử dụng.',
      });
    }
    return payload;
  }

  private async consumeOAuthNonce(nonce: string): Promise<boolean> {
    const result: unknown = await this.redisService
      .getClient()
      .eval(
        "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); return value else return false end",
        1,
        this.oauthStateKey(nonce),
      );
    return result === '1';
  }

  private oauthStateKey(nonce: string): string {
    return `livestream:facebook:oauth-state:${nonce}`;
  }

  private async exchangeCode(code: string): Promise<string> {
    const payload = await this.requestGraph('/oauth/access_token', 'GET', {
      client_id: this.configService.get<string>('FACEBOOK_APP_ID', ''),
      client_secret: this.configService.get<string>('FACEBOOK_APP_SECRET', ''),
      redirect_uri: this.configService.get<string>(
        'FACEBOOK_OAUTH_REDIRECT_URI',
        '',
      ),
      code,
    });
    const token = readString(payload, 'access_token');
    if (!token) {
      throw new FacebookLiveProviderException(
        'FACEBOOK_CONNECTION_EXPIRED',
        'Facebook không trả về quyền truy cập hợp lệ.',
      );
    }
    return token;
  }

  private async listPages(
    userAccessToken: string,
  ): Promise<readonly FacebookPage[]> {
    const payload = await this.requestGraph('/me/accounts', 'GET', {
      fields: 'id,name,access_token,tasks',
      access_token: userAccessToken,
    });
    const pages = isFacebookPagesResponse(payload) ? (payload.data ?? []) : [];
    return pages.filter((page) =>
      Boolean(page.id && page.name && page.access_token),
    );
  }

  private async getGrantedPermissions(
    userAccessToken: string,
  ): Promise<readonly string[]> {
    const payload = await this.requestGraph('/me/permissions', 'GET', {
      access_token: userAccessToken,
    });
    if (!isFacebookPermissionsResponse(payload)) {
      return [];
    }
    return (payload.data ?? [])
      .filter(
        (entry) =>
          entry.status === 'granted' && typeof entry.permission === 'string',
      )
      .map((entry) => entry.permission as string);
  }

  private async requestGraph(
    path: string,
    method: 'GET',
    query: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const baseUrl = this.configService
      .get<string>('FACEBOOK_GRAPH_API_BASE_URL', 'https://graph.facebook.com')
      .replace(/\/$/, '');
    const version = this.configService.get<string>(
      'FACEBOOK_GRAPH_API_VERSION',
      'v23.0',
    );
    const url = new URL(`${baseUrl}/${version}${path}`);
    Object.entries(query).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );

    try {
      const response = await fetch(url, { method });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok || !isRecord(body)) {
        throw new FacebookLiveProviderException(
          response.status === 401
            ? 'FACEBOOK_CONNECTION_EXPIRED'
            : 'PROVIDER_UNAVAILABLE',
          'Facebook hiện không khả dụng.',
        );
      }
      return body;
    } catch (error) {
      if (error instanceof FacebookLiveProviderException) {
        throw error;
      }
      throw new ServiceUnavailableException('Facebook hiện không khả dụng.');
    }
  }

  private toPublicConnection(
    connection: FacebookPageConnectionRow,
  ): PublicFacebookPageConnection {
    return {
      id: connection.id,
      communityId: connection.communityId,
      pageId: connection.pageId,
      pageName: connection.pageName,
      status: connection.status,
      scopes: connection.scopes,
      connectedBy: connection.connectedBy,
      connectedAt: connection.connectedAt,
      lastValidatedAt: connection.lastValidatedAt,
      updatedAt: connection.updatedAt,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const candidate = value[key];
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : null;
}

function isOAuthStatePayload(value: unknown): value is OAuthStatePayload {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.communityId === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.issuedAt === 'number' &&
    typeof value.nonce === 'string'
  );
}

function isFacebookPagesResponse(
  value: Record<string, unknown>,
): value is FacebookPagesResponse {
  return Array.isArray(value.data);
}

function isFacebookPermissionsResponse(
  value: Record<string, unknown>,
): value is FacebookPermissionsResponse {
  return Array.isArray(value.data);
}
