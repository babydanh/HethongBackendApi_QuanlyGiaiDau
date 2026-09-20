import { CommunityImageModerationService } from './community-image-moderation.service';
import { BarcodeFormat, QRCodeWriter } from '@zxing/library';
import sharp from 'sharp';

describe('CommunityImageModerationService', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'COMMUNITY_IMAGE_OCR_ENABLED') return 'false';
      return undefined;
    }),
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    config.get.mockClear();
  });

  it('returns clean without touching the network when no media is attached', async () => {
    const service = new CommunityImageModerationService(config as never);

    await expect(service.scanMediaUrls()).resolves.toEqual({
      status: 'CLEAN',
      extractedText: '',
      qrPayloads: [],
      scannedUrls: [],
      unscannedUrls: [],
    });
  });

  it('does not fetch arbitrary URLs and sends them to review', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new CommunityImageModerationService(config as never);

    const result = await service.scanMediaUrls(['http://169.254.169.254/image/upload/internal.jpg']);

    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.unscannedUrls).toEqual(['http://169.254.169.254/image/upload/internal.jpg']);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not fetch non-storage HTTPS URLs even when they look like images', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new CommunityImageModerationService(config as never);

    const result = await service.scanMediaUrls(['https://example.com/image/upload/public.jpg']);

    expect(result.status).toBe('NEEDS_REVIEW');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('decodes QR payloads before OCR/AI', async () => {
    const matrix = new QRCodeWriter().encode(
      'https://example.com/contact',
      BarcodeFormat.QR_CODE,
      256,
      256,
      new Map(),
    );
    const pixels = Buffer.alloc(256 * 256);
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        pixels[y * 256 + x] = matrix.get(x, y) ? 0 : 255;
      }
    }
    const png = await sharp(pixels, { raw: { width: 256, height: 256, channels: 1 } }).png().toBuffer();
    const raw = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    const service = new CommunityImageModerationService(config as never);
    const decodeQr = (service as unknown as {
      decodeQr: (data: Buffer, width: number, height: number) => string | null;
    }).decodeQr;

    expect(decodeQr(raw.data, raw.info.width, raw.info.height)).toBe('https://example.com/contact');
  });
});
