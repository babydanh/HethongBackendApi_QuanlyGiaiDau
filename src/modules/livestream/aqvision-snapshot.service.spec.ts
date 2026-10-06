import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AqvisionApiClient } from './aqvision-api.client';
import {
  AqvisionSnapshotService,
  CaptureSnapshotOptions,
} from './aqvision-snapshot.service';

/** Đoạn JSON lỗi giả lập AQP trả nhầm thay vì ảnh (code envelope -100). */
const JSON_ERROR_BODY = '{"code":-100,"msg":"Incorrect secret"}';

/** Magic bytes JPEG: FF D8 FF E0 (JFIF). */
function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
}



describe('AqvisionSnapshotService', () => {
  const STREAM_URL =
    'rtsp://camera-user:camera-pass@10.0.0.7:554/cam/realmonitor';

  let service: AqvisionSnapshotService;
  let getSnapSpy: jest.SpyInstance<
    Promise<Buffer>,
    [{ url: string; timeoutSec: number; expireSec: number }]
  >;

  beforeEach(() => {
    // Client mồ hôi: secret bất kỳ (service không đọc config).
    const config = { get: () => 'unit-test-secret' };
    const client = new AqvisionApiClient(
      config as unknown as ConfigService,
    );
    getSnapSpy = jest.spyOn(client, 'getSnap');
    service = new AqvisionSnapshotService(client);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('captureSnapshot', () => {
    it('buffer JPEG hop le (FF D8 FF E0) => tra ve buffer goc', async () => {
      const image = jpegBuffer();
      getSnapSpy.mockResolvedValue(image);

      const result = await service.captureSnapshot(STREAM_URL);

      expect(result).toBe(image);
      expect(Array.from(result.subarray(0, 4))).toEqual([
        0xff, 0xd8, 0xff, 0xe0,
      ]);
    });

    it('buffer khong phai JPEG (JSON loi {"code":-100}) => nem AqvisionApiException code -1', async () => {
      getSnapSpy.mockResolvedValue(Buffer.from(JSON_ERROR_BODY, 'utf8'));

      await expect(service.captureSnapshot(STREAM_URL)).rejects.toMatchObject({
        name: 'AqvisionApiException',
        providerCode: -1,
        message: 'AQP không trả ảnh JPEG hợp lệ.',
      });
    });

    it('payload rong => nem loi (khong du magic bytes)', async () => {
      getSnapSpy.mockResolvedValue(Buffer.alloc(0));

      await expect(service.captureSnapshot(STREAM_URL)).rejects.toMatchObject({
        providerCode: -1,
      });
    });

    it('khong truyen opts => getSnap nhan mac dinh timeoutSec=5, expireSec=10', async () => {
      getSnapSpy.mockResolvedValue(jpegBuffer());

      await service.captureSnapshot(STREAM_URL);

      expect(getSnapSpy).toHaveBeenCalledWith({
        url: STREAM_URL,
        timeoutSec: 5,
        expireSec: 10,
      });
    });

    it('truyen opts => getSnap nhan gia tri opts', async () => {
      const opts: CaptureSnapshotOptions = { timeoutSec: 12, expireSec: 30 };
      getSnapSpy.mockResolvedValue(jpegBuffer());

      await service.captureSnapshot(STREAM_URL, opts);

      expect(getSnapSpy).toHaveBeenCalledWith({
        url: STREAM_URL,
        timeoutSec: 12,
        expireSec: 30,
      });
    });

    it('truyen partial opts => chi ghi de gia tri duoc truyen', async () => {
      getSnapSpy.mockResolvedValue(jpegBuffer());

      await service.captureSnapshot(STREAM_URL, { timeoutSec: 8 });

      expect(getSnapSpy).toHaveBeenCalledWith({
        url: STREAM_URL,
        timeoutSec: 8,
        expireSec: 10,
      });
    });
  });

  describe('bao mat: khong log streamUrl (co the chua credential user:password@)', () => {
    it('log khong chua streamUrl khi snapshot thanh cong', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      const logSpy = jest.spyOn(Logger.prototype, 'log');
      getSnapSpy.mockResolvedValue(jpegBuffer());

      await service.captureSnapshot(STREAM_URL);

      const logged = [
        ...warnSpy.mock.calls.flat(),
        ...logSpy.mock.calls.flat(),
      ]
        .join(' ')
        .toString();
      expect(logged).not.toContain(STREAM_URL);
      expect(logged).not.toContain('camera-user');
      expect(logged).not.toContain('camera-pass');
      expect(logged).not.toContain('10.0.0.7');
    });

    it('log khong chua streamUrl khi payload khong phai JPEG', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      getSnapSpy.mockResolvedValue(Buffer.from(JSON_ERROR_BODY, 'utf8'));

      await expect(service.captureSnapshot(STREAM_URL)).rejects.toBeDefined();

      const logged = warnSpy.mock.calls.flat().join(' ').toString();
      expect(logged).not.toContain(STREAM_URL);
      expect(logged).not.toContain('camera-user');
      expect(logged).not.toContain('camera-pass');
    });
  });

  describe('isJpeg', () => {
    it('FF D8 FF E0 => true', () => {
      expect(service.isJpeg(jpegBuffer())).toBe(true);
    });

    it('FF D8 FF (dung 3 bytes) => true', () => {
      expect(service.isJpeg(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
    });

    it('JSON error body => false', () => {
      expect(
        service.isJpeg(Buffer.from(JSON_ERROR_BODY, 'utf8')),
      ).toBe(false);
    });

    it('buffer rong => false', () => {
      expect(service.isJpeg(Buffer.alloc(0))).toBe(false);
    });

    it('chi 2 bytes => false', () => {
      expect(service.isJpeg(Buffer.from([0xff, 0xd8]))).toBe(false);
    });

    it('magic sai o byte thu 3 (FF D8 FE) => false', () => {
      expect(
        service.isJpeg(Buffer.from([0xff, 0xd8, 0xfe, 0xe0])),
      ).toBe(false);
    });
  });
});
