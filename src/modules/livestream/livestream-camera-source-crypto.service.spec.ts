import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

type CameraSourceCrypto = {
  encrypt(source: string): string;
  decrypt(serialized: string): string;
};
type CameraSourceCryptoConstructor = new (
  configService: ConfigService,
) => CameraSourceCrypto;

const TEST_KEY = 'a'.repeat(64);
const CAMERA_SOURCE =
  'rtsp://operator:fixture-password@192.0.2.10:554/live/primary';

function loadCameraSourceCrypto(): CameraSourceCryptoConstructor | null {
  try {
    return require('./livestream-camera-source-crypto.service')
      .LivestreamCameraSourceCryptoService as CameraSourceCryptoConstructor;
  } catch {
    return null;
  }
}

function makeConfigService(key: string): ConfigService {
  return { get: () => key } as unknown as ConfigService;
}

describe('LivestreamCameraSourceCryptoService', () => {
  it('round-trips a camera source without storing plaintext', () => {
    const CryptoService = loadCameraSourceCrypto();
    expect(CryptoService).not.toBeNull();
    if (!CryptoService) return;

    const crypto = new CryptoService(makeConfigService(TEST_KEY));
    const encrypted = crypto.encrypt(CAMERA_SOURCE);

    expect(encrypted).not.toContain(CAMERA_SOURCE);
    expect(crypto.decrypt(encrypted)).toBe(CAMERA_SOURCE);
  });

  it('fails closed when the dedicated encryption key is absent', () => {
    const CryptoService = loadCameraSourceCrypto();
    expect(CryptoService).not.toBeNull();
    if (!CryptoService) return;

    const crypto = new CryptoService(makeConfigService(''));

    expect(() => crypto.encrypt(CAMERA_SOURCE)).toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects ciphertext encrypted with a different key', () => {
    const CryptoService = loadCameraSourceCrypto();
    expect(CryptoService).not.toBeNull();
    if (!CryptoService) return;

    const encrypted = new CryptoService(makeConfigService(TEST_KEY)).encrypt(
      CAMERA_SOURCE,
    );
    const otherKey = new CryptoService(makeConfigService('b'.repeat(64)));

    expect(() => otherKey.decrypt(encrypted)).toThrow(
      InternalServerErrorException,
    );
  });
});
