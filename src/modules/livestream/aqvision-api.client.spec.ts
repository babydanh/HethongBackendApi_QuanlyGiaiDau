import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  AqvisionApiClient,
  AqvisionApiException,
} from './aqvision-api.client';

const SECRET = 'unit-test-secret';

/** Stands in for the agency client: hands out a bearer token, or fails like a broken agency setup. */
type TokenProvider = { getBearerToken: jest.Mock<Promise<string>, []> };

function makeClient(
  overrides: Record<string, unknown> = {},
  tokenProvider?: TokenProvider,
): AqvisionApiClient {
  const values: Record<string, unknown> = {
    AQVISION_API_BASE_URL: 'https://api.media.aqvision.net',
    AQVISION_API_SECRET: SECRET,
    AQVISION_API_TIMEOUT_SECONDS: 5,
    ...overrides,
  };
  const config = {
    get: (key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
  };
  return new AqvisionApiClient(
    config as unknown as ConfigService,
    tokenProvider as unknown as ConstructorParameters<typeof AqvisionApiClient>[1],
  );
}

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

function binaryResponse(bytes: Uint8Array, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new Error('not json');
    },
    arrayBuffer: async () => bytes.buffer.slice(0),
  } as unknown as Response;
}

describe('AqvisionApiClient', () => {
  const originalFetch = global.fetch;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('fail-closed va bao mat (INV-001)', () => {
    it('secret rong => nem loi TRUOC khi dung URL, khong phat request nao', async () => {
      const client = makeClient({ AQVISION_API_SECRET: '   ' });

      await expect(client.isMediaOnline('camera01')).rejects.toBeInstanceOf(
        AqvisionApiException,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('secret rong => khong log gia tri secret hay query string', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      const client = makeClient({ AQVISION_API_SECRET: '' });

      await expect(client.isMediaOnline('camera01')).rejects.toBeInstanceOf(
        AqvisionApiException,
      );

      const logged = warnSpy.mock.calls.flat().join(' ');
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain('secret=');
      expect(logged).not.toContain('api.media.aqvision.net');
    });

    it('provider loi => log khong chua secret', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      fetchSpy.mockResolvedValue(
        jsonResponse({ code: -100, msg: 'Incorrect secret' }),
      );

      await expect(
        makeClient().isMediaOnline('camera01'),
      ).rejects.toBeInstanceOf(AqvisionApiException);

      const logged = warnSpy.mock.calls.flat().join(' ');
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain('secret=');
      expect(logged).toContain('code=-100');
    });
  });

  describe('method theo api.txt', () => {
    it('isMediaOnline dung GET va gui du schema/vhost/app/stream', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ code: 0, online: true }));

      const result = await makeClient().isMediaOnline('camera01');

      expect(result).toEqual({ online: true });
      const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toContain('/index/api/isMediaOnline?');
      expect(calledUrl).toContain('schema=rtsp');
      expect(calledUrl).toContain('vhost=__defaultVhost__');
      expect(calledUrl).toContain('app=live');
      expect(calledUrl).toContain('stream=camera01');
      expect(init.method).toBe('GET');
    });

    it('startRecord dung POST nhung tham so van nam o query string', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ code: 0, result: true }));

      await makeClient().call('startRecord', {
        type: 1,
        stream: 'camera01',
      });

      const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect(init.body).toBeUndefined();
      expect(calledUrl).toContain('type=1');
      expect(calledUrl).toContain('stream=camera01');
    });

    it('khong thu lai POST (tranh ghi trung) nhung co thu lai GET', async () => {
      fetchSpy.mockRejectedValue(new Error('network down'));
      await expect(
        makeClient().call('stopRecord', { type: 1, stream: 'camera01' }),
      ).rejects.toBeInstanceOf(AqvisionApiException);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockClear();
      fetchSpy.mockRejectedValue(new Error('network down'));
      await expect(
        makeClient().isMediaOnline('camera01'),
      ).rejects.toBeInstanceOf(AqvisionApiException);
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('addStreamProxy', () => {
    it('sends the documented HLS and MP4 flags in the POST query', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse({ code: 0, data: { key: '__defaultVhost__/proxy/1' } }),
      );

      const client = makeClient();
      const input = Object.assign(
        {
          stream: 'camera01',
          url: 'https://source.example/live.m3u8',
        },
        { enableHls: true, enableMp4: true },
      );
      const result = await client.addStreamProxy(input);

      expect(result).toEqual({ proxyKey: '__defaultVhost__/proxy/1' });
      const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const query = new URL(calledUrl).searchParams;
      expect(init.method).toBe('POST');
      expect(init.body).toBeUndefined();
      expect(query.get('url')).toBe('https://source.example/live.m3u8');
      expect(query.get('enable_hls')).toBe('1');
      expect(query.get('enable_mp4')).toBe('1');
    });
  });

  describe('getMP4RecordFile', () => {
    it('map paths[] + rootPath; bo period => liet ke thu muc ngay', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse({
          code: 0,
          data: {
            paths: ['22-20-30.mp4', '22-13-12.mp4'],
            rootPath: '/www/live/live/2020-01-24/',
          },
        }),
      );

      const result = await makeClient().getMp4RecordFile({ stream: 'camera01' });

      expect(result.paths).toEqual(['22-20-30.mp4', '22-13-12.mp4']);
      expect(result.rootPath).toBe('/www/live/live/2020-01-24/');
      expect(result.files).toBeUndefined();
      const [calledUrl] = fetchSpy.mock.calls[0] as [string];
      expect(calledUrl).not.toContain('period=');
      expect(calledUrl).not.toContain('with_size=');
    });

    it('with_size=1 => map data_files[] sang files[{name,sizeBytes}]', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse({
          code: 0,
          data: {
            paths: ['22-20-30.mp4'],
            rootPath: '/www/live/live/2026-10-04/',
            data_files: [
              { name: '22-20-30.mp4', sizeBytes: 1048576 },
              { name: 'broken' },
            ],
          },
        }),
      );

      const result = await makeClient().getMp4RecordFile({
        stream: 'camera01',
        period: '2026-10-04',
        withSize: true,
      });

      expect(result.files).toEqual([
        { name: '22-20-30.mp4', sizeBytes: 1048576 },
      ]);
      const [calledUrl] = fetchSpy.mock.calls[0] as [string];
      expect(calledUrl).toContain('period=2026-10-04');
      expect(calledUrl).toContain('with_size=1');
    });
  });

  describe('getSnap', () => {
    it('tra Buffer JPEG, khong di qua envelope JSON', async () => {
      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      fetchSpy.mockResolvedValue(binaryResponse(jpeg));

      const bytes = await makeClient().getSnap({
        url: 'rtsp://127.0.0.1:554/live/camera01',
        timeoutSec: 5,
        expireSec: 10,
      });

      expect(Buffer.isBuffer(bytes)).toBe(true);
      expect(bytes.length).toBe(4);
      const [calledUrl] = fetchSpy.mock.calls[0] as [string];
      expect(calledUrl).toContain('timeout_sec=5');
      expect(calledUrl).toContain('expire_sec=10');
    });

    it('KHONG gui vhost/app trong query (chi secret, url, timeout_sec, expire_sec)', async () => {
      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      fetchSpy.mockResolvedValue(binaryResponse(jpeg));

      await makeClient().getSnap({
        url: 'rtsp://127.0.0.1:554/live/camera01',
        timeoutSec: 5,
        expireSec: 10,
      });

      const [calledUrl] = fetchSpy.mock.calls[0] as [string];
      // Đủ 4 tham số theo vendor api.txt cho getSnap.
      expect(calledUrl).toContain('secret=unit-test-secret');
      expect(calledUrl).toContain('timeout_sec=5');
      expect(calledUrl).toContain('expire_sec=10');
      // getSnap KHÔNG nhận vhost/app (khác mọi endpoint còn lại).
      expect(calledUrl).not.toContain('vhost=');
      expect(calledUrl).not.toContain('app=');
    });

    it('endpoint khac (isMediaOnline) VAN gui vhost/app', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ code: 0, online: true }));

      await makeClient().isMediaOnline('camera01');

      const [calledUrl] = fetchSpy.mock.calls[0] as [string];
      expect(calledUrl).toContain('vhost=__defaultVhost__');
      expect(calledUrl).toContain('app=live');
    });

    it('JPEG rong => nem loi thay vi tra Buffer rong', async () => {
      fetchSpy.mockResolvedValue(binaryResponse(new Uint8Array(0)));

      await expect(
        makeClient().getSnap({
          url: 'rtsp://127.0.0.1:554/live/camera01',
          timeoutSec: 5,
          expireSec: 10,
        }),
      ).rejects.toBeInstanceOf(AqvisionApiException);
    });
  });

  describe('envelope', () => {
    it('code=0 => tra data', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse({ code: 0, data: { key: '__defaultVhost__/proxy/0' } }),
      );

      const data = await makeClient().call<{ key: string }>('addStreamProxy', {
        stream: 'camera01',
        url: 'rtsp://192.168.1.20/stream1',
      });

      expect(data).toEqual({ key: '__defaultVhost__/proxy/0' });
    });

    it.each([
      [-300, 'Required parameter missed: "secret"'],
      [-100, 'Incorrect secret'],
      [-400, 'Exception'],
      [-1, 'Other failed'],
    ])('code=%i => nem AqvisionApiException', async (code, msg) => {
      fetchSpy.mockResolvedValue(jsonResponse({ code, msg }));

      await expect(
        makeClient().isMediaOnline('camera01'),
      ).rejects.toMatchObject({ providerCode: code });
    });
  });

  describe('ghi MP4 typed wrappers', () => {
    it('startRecordMp4 => POST /startRecord, type=1, stream; result true => resolve', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ code: 0, result: true }));

      await makeClient().startRecordMp4('camera01');

      const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect(init.body).toBeUndefined();
      expect(calledUrl).toContain('/index/api/startRecord?');
      expect(calledUrl).toContain('type=1');
      expect(calledUrl).toContain('stream=camera01');
    });

    it('startRecordMp4 result !== true => nem AqvisionApiException da sanitize', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ code: 0, result: 'yes' }));

      const error: unknown = await makeClient()
        .startRecordMp4('camera01')
        .then(
          () => {
            throw new Error('expected rejection');
          },
          (e: unknown) => e,
        );

      expect(error).toBeInstanceOf(AqvisionApiException);
      expect((error as Error).message).not.toContain(SECRET);
      expect((error as Error).message).not.toContain('api.media.aqvision.net');
    });

    it('stopRecordMp4 => POST /stopRecord, type=1, stream; result true => resolve', async () => {
      fetchSpy.mockResolvedValue(
        jsonResponse({ code: 0, data: { result: true } }),
      );

      await makeClient().stopRecordMp4('camera01');

      const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('POST');
      expect(calledUrl).toContain('/index/api/stopRecord?');
      expect(calledUrl).toContain('type=1');
      expect(calledUrl).toContain('stream=camera01');
    });

    it('stopRecordMp4 result !== true => nem AqvisionApiException', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ code: 0, result: false }));

      await expect(
        makeClient().stopRecordMp4('camera01'),
      ).rejects.toBeInstanceOf(AqvisionApiException);
    });

    it('isRecordingMp4 => GET /isRecording, type=1, stream; status true => true', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ code: 0, status: true }));

      const result = await makeClient().isRecordingMp4('camera01');

      expect(result).toBe(true);
      const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('GET');
      expect(calledUrl).toContain('/index/api/isRecording?');
      expect(calledUrl).toContain('type=1');
      expect(calledUrl).toContain('stream=camera01');
    });

    it('isRecordingMp4 status false => false', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ code: 0, status: false }));

      const result = await makeClient().isRecordingMp4('camera01');

      expect(result).toBe(false);
    });

    it('isRecordingMp4 status malformed (string/missing) => nem AqvisionApiException', async () => {
      fetchSpy.mockResolvedValue(jsonResponse({ code: 0, status: 'true' }));
      await expect(
        makeClient().isRecordingMp4('camera01'),
      ).rejects.toBeInstanceOf(AqvisionApiException);

      fetchSpy.mockClear();
      fetchSpy.mockResolvedValue(jsonResponse({ code: 0 }));
      await expect(
        makeClient().isRecordingMp4('camera01'),
      ).rejects.toBeInstanceOf(AqvisionApiException);
    });

    it('startRecordMp4 POST khong thu lai khi network loi', async () => {
      fetchSpy.mockRejectedValue(new Error('network down'));

      await expect(
        makeClient().startRecordMp4('camera01'),
      ).rejects.toBeInstanceOf(AqvisionApiException);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('isRecordingMp4 GET thu lai bounded khi network loi', async () => {
      fetchSpy.mockRejectedValue(new Error('network down'));

      await expect(
        makeClient().isRecordingMp4('camera01'),
      ).rejects.toBeInstanceOf(AqvisionApiException);
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(1);
    });

    it('provider tu choi => log khong chua secret hay URL', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      fetchSpy.mockResolvedValue(jsonResponse({ code: -1, msg: 'Other failed' }));

      await expect(
        makeClient().startRecordMp4('camera01'),
      ).rejects.toMatchObject({ providerCode: -1 });

      const logged = warnSpy.mock.calls.flat().join(' ');
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain('secret=');
      expect(logged).not.toContain('api.media.aqvision.net');
    });

    it('HTTP loi => log operation + status, khong chua secret hay URL', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      fetchSpy.mockResolvedValue(jsonResponse({}, 502));

      await expect(
        makeClient().getMp4RecordFile({ stream: 'camera01' }),
      ).rejects.toMatchObject({ providerCode: 502 });

      const logged = warnSpy.mock.calls.flat().join(' ');
      expect(logged).toContain('getMP4RecordFile');
      expect(logged).toContain('HTTP 502');
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain('secret=');
      expect(logged).not.toContain('api.media.aqvision.net');
    });
  });

  // The same number can come from different places, so the exception carries
  // where it came from. Without it a provider `code:404` is indistinguishable
  // from an HTTP 404 and a local missing secret from a provider `code:-100`.
  describe('failure source', () => {
    it('a missing local secret is tagged config', async () => {
      await expect(
        makeClient({ AQVISION_API_SECRET: '   ' }).isMediaOnline('camera01'),
      ).rejects.toMatchObject({ providerCode: -100, source: 'config' });
    });

    it.each([-100, 404, 502, -1])(
      'provider envelope code %i has no source (it is not an HTTP status)',
      async (code) => {
        fetchSpy.mockResolvedValue(jsonResponse({ code, msg: 'x' }));

        const error = await makeClient()
          .isMediaOnline('camera01')
          .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(AqvisionApiException);
        expect(error).toMatchObject({ providerCode: code });
        expect((error as AqvisionApiException).source).toBeUndefined();
      },
    );

    it.each([404, 502])('a real HTTP %i is tagged http', async (status) => {
      fetchSpy.mockResolvedValue(jsonResponse({}, status));

      await expect(
        makeClient().getMp4RecordFile({ stream: 'camera01' }),
      ).rejects.toMatchObject({ providerCode: status, source: 'http' });
    });

    it('no response from the network is tagged transport', async () => {
      fetchSpy.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(
        makeClient().startRecordMp4('camera01'),
      ).rejects.toMatchObject({ providerCode: -1, source: 'transport' });
    });

    it('a 200 body that is not JSON has no source and code -1', async () => {
      // binaryResponse's json() throws, like an HTML page from a proxy.
      fetchSpy.mockResolvedValue(binaryResponse(new Uint8Array(), 200));

      const error = await makeClient()
        .isMediaOnline('camera01')
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({ providerCode: -1 });
      expect(error).not.toHaveProperty('source', expect.any(String));
    });
  });

  describe('recording operations fall back to the agency bearer token', () => {
    const TOKEN = 'agency-jwt-for-test';
    const rejected = () => jsonResponse({ code: -100, msg: 'Incorrect secret' });
    const accepted = (data: unknown = { result: true }) => jsonResponse({ code: 0, data });
    const provider = (): TokenProvider => ({
      getBearerToken: jest.fn().mockResolvedValue(TOKEN),
    });
    const callAt = (index: number): unknown[] => fetchSpy.mock.calls[index] as unknown[];
    const urlAt = (index: number) => String(callAt(index)[0]);
    const headersAt = (index: number) =>
      (callAt(index)[1] as { headers?: Record<string, string> } | undefined)?.headers ?? {};

    it('retries once with Bearer and no secret when AQP rejects the secret', async () => {
      fetchSpy.mockResolvedValueOnce(rejected()).mockResolvedValueOnce(accepted());
      const tokens = provider();

      await makeClient({}, tokens).startRecordMp4('camera01');

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(urlAt(0)).toContain(`secret=${SECRET}`);
      expect(headersAt(0)).not.toHaveProperty('Authorization');
      expect(urlAt(1)).not.toContain('secret=');
      expect(urlAt(1)).toContain('/index/api/startRecord');
      expect(urlAt(1)).toContain('stream=camera01');
      expect(headersAt(1)).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
      expect(tokens.getBearerToken).toHaveBeenCalledTimes(1);
    });

    it('covers all four recording operations and no other operation', async () => {
      const covered = async (run: (client: AqvisionApiClient) => Promise<unknown>) => {
        fetchSpy.mockReset();
        fetchSpy.mockResolvedValue(rejected());
        await run(makeClient({}, provider())).catch(() => undefined);
        return fetchSpy.mock.calls.length;
      };

      expect(await covered((c) => c.startRecordMp4('camera01'))).toBe(2);
      expect(await covered((c) => c.stopRecordMp4('camera01'))).toBe(2);
      expect(await covered((c) => c.isRecordingMp4('camera01'))).toBe(2);
      expect(await covered((c) => c.getMp4RecordFile({ stream: 'camera01' }))).toBe(2);
      expect(await covered((c) => c.isMediaOnline('camera01'))).toBe(1);
      expect(
        await covered((c) => c.addStreamProxy({ stream: 'camera01', url: 'rtsp://x/y' })),
      ).toBe(1);
    });

    it('does not fetch a token while the secret is accepted', async () => {
      fetchSpy.mockResolvedValue(accepted({ status: true }));
      const tokens = provider();

      await expect(makeClient({}, tokens).isRecordingMp4('camera01')).resolves.toBe(true);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(tokens.getBearerToken).not.toHaveBeenCalled();
    });

    it('without a token provider the behaviour is unchanged: one request, then -100', async () => {
      fetchSpy.mockResolvedValue(rejected());

      await expect(makeClient().stopRecordMp4('camera01')).rejects.toMatchObject({
        providerCode: -100,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('rethrows the original -100 after exactly one retry when Bearer is rejected too', async () => {
      fetchSpy.mockResolvedValue(rejected());

      await expect(makeClient({}, provider()).startRecordMp4('camera01')).rejects.toMatchObject({
        providerCode: -100,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('keeps the -100 of the secret attempt when the agency token cannot be obtained', async () => {
      fetchSpy.mockResolvedValue(rejected());
      const broken: TokenProvider = {
        getBearerToken: jest.fn().mockRejectedValue(new Error('agency not configured')),
      };

      const error = await makeClient({}, broken)
        .getMp4RecordFile({ stream: 'camera01' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AqvisionApiException);
      expect(error).toMatchObject({ providerCode: -100 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('remembers that Bearer works, so the next call goes straight to it', async () => {
      fetchSpy
        .mockResolvedValueOnce(rejected())
        .mockResolvedValueOnce(accepted())
        .mockResolvedValueOnce(accepted({ status: false }));
      const client = makeClient({}, provider());

      await client.startRecordMp4('camera01');
      await expect(client.isRecordingMp4('camera01')).resolves.toBe(false);

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(urlAt(2)).not.toContain('secret=');
      expect(headersAt(2)).toMatchObject({ Authorization: `Bearer ${TOKEN}` });
    });

    it('goes back to the secret first when a remembered Bearer is rejected', async () => {
      fetchSpy
        .mockResolvedValueOnce(rejected()) // secret, call 1
        .mockResolvedValueOnce(accepted()) // bearer, call 1 -> remembered
        .mockResolvedValueOnce(rejected()) // bearer first, call 2
        .mockResolvedValueOnce(accepted({ status: true })) // secret, call 2
        .mockResolvedValueOnce(accepted({ status: true })); // call 3
      const client = makeClient({}, provider());

      await client.startRecordMp4('camera01');
      await expect(client.isRecordingMp4('camera01')).resolves.toBe(true);
      await expect(client.isRecordingMp4('camera01')).resolves.toBe(true);

      expect(fetchSpy).toHaveBeenCalledTimes(5);
      expect(urlAt(3)).toContain(`secret=${SECRET}`);
      // The last call starts with the secret again, not with the Bearer that just failed.
      expect(urlAt(4)).toContain(`secret=${SECRET}`);
    });

    it('never writes the secret or the token to the log', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      fetchSpy.mockResolvedValue(rejected());

      await makeClient({}, provider())
        .startRecordMp4('camera01')
        .catch(() => undefined);

      const logged = warnSpy.mock.calls.flat().join(' ');
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain(TOKEN);
      expect(logged).not.toContain('Bearer');
      expect(logged).not.toContain('secret=');
    });
  });
});
