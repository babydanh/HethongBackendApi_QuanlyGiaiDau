import type { ConfigService } from '@nestjs/config';
import { AqvisionAgencyApiClient } from './aqvision-agency-api.client';

const TOKEN = 'agency-jwt-test';
const SECRET = 'agency-secret-test';
const now = Date.now();

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeClient(config: Record<string, string | number> = {}) {
  const values = {
    AQVISION_AGENCY_BASE_URL: 'https://media.aqvision.net',
    AQVISION_AGENCY_ID: 'agency-test',
    AQVISION_AGENCY_SECRET: SECRET,
    AQVISION_API_TIMEOUT_SECONDS: 3,
    ...config,
  };
  return new AqvisionAgencyApiClient({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
}

describe('AqvisionAgencyApiClient', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('rejects a non-HTTPS Agency base URL before sending credentials', async () => {
    await expect(
      makeClient({ AQVISION_AGENCY_BASE_URL: 'http://media.aqvision.net' }).listStreamKeys(),
    ).rejects.toThrow('HTTPS');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('authenticates server-to-server and creates a stream key with the Bearer token', async () => {
    const push = { rtmpServer: 'rtmp://push.example/live', streamKey: 'cam_1?key=secret' };
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { token: TOKEN, expiresAt: new Date(now + 3_600_000).toISOString() },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 201,
          data: { id: 'key-1', app: 'live', stream: 'cam_1', status: 'Offline', push },
        }, 201),
      );

    const result = await makeClient().createStreamKey({ app: 'live', stream: 'cam_1' });

    expect(result).toEqual({
      id: 'key-1',
      app: 'live',
      stream: 'cam_1',
      status: 'Offline',
      push,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://media.aqvision.net/api/v1/auth/token',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({ agency_id: 'agency-test', api_secret: SECRET }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://media.aqvision.net/api/v1/stream-keys',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        body: JSON.stringify({ app: 'live', stream: 'cam_1' }),
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      }),
    );
  });

  it('reuses the token until the vendor expiry timestamp', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { token: TOKEN, expiresAt: new Date(now + 3_600_000).toISOString() },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { id: 'key-1', app: 'live', stream: 'cam_1', status: 'Offline', push: null },
        }),
      );

    const client = makeClient();
    await client.listStreamKeys();
    await client.getStreamKey('key-1');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][1]).toEqual(
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }) }),
    );
    expect(fetchMock.mock.calls[2][1]).toEqual(
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }) }),
    );
  });
  it('updates a revoked stream name with PATCH or full PUT payload', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { token: TOKEN, expiresAt: new Date(now + 3_600_000).toISOString() },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { id: 'key-1', app: 'live', stream: 'cam_new', status: 'Offline', push: null },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { id: 'key-1', app: 'live', stream: 'cam_new', status: 'Offline', push: null },
        }),
      );

    const client = makeClient();
    await client.updateStreamKey('key-1', { stream: 'cam_new' });
    await client.updateStreamKey('key-1', { stream: 'cam_new' }, 'PUT');

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://media.aqvision.net/api/v1/stream-keys/key-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ stream: 'cam_new' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://media.aqvision.net/api/v1/stream-keys/key-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ app: 'live', stream: 'cam_new' }),
      }),
    );
  });

  it('marks a malformed successful mutation response as possibly applied', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { token: TOKEN, expiresAt: new Date(now + 3_600_000).toISOString() },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { id: 'key-1', app: 'live', stream: 'cam_new' },
        }),
      );

    await expect(
      makeClient().updateStreamKey('key-1', { stream: 'cam_new' }),
    ).rejects.toMatchObject({ mayHaveApplied: true });
  });

  it('fails closed without an agency credential and sends no request', async () => {
    await expect(
      makeClient({ AQVISION_AGENCY_SECRET: '' }).listStreamKeys(),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves the explicit revoked-but-not-disconnected DELETE outcome for service reconciliation', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { token: TOKEN, expiresAt: new Date(now + 3_600_000).toISOString() },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ code: 503, data: { keyRevoked: true, disconnected: false } }, 503),
      );

    await expect(makeClient().deleteStreamKey('key-1')).resolves.toEqual({
      keyRevoked: true,
      disconnected: false,
    });
  });

  it('does not retry a stream-key POST after a non-success response', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: { token: TOKEN, expiresAt: new Date(now + 3_600_000).toISOString() },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ code: 409, msg: 'stream conflict' }, 409));

    await expect(
      makeClient().createStreamKey({ app: 'live', stream: 'cam_1' }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
