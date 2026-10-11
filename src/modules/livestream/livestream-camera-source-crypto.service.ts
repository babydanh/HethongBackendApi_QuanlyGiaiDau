import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const CONFIG_KEY = 'LIVESTREAM_CAMERA_SOURCE_ENCRYPTION_KEY';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SERIALIZED_VERSION = 'v1';

@Injectable()
export class LivestreamCameraSourceCryptoService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(source: string): string {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const cipherText = Buffer.concat([
      cipher.update(source, 'utf8'),
      cipher.final(),
    ]);

    return [
      SERIALIZED_VERSION,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      cipherText.toString('base64url'),
    ].join('.');
  }

  decrypt(serialized: string): string {
    const [version, ivValue, authTagValue, cipherTextValue] =
      serialized.split('.');
    if (
      version !== SERIALIZED_VERSION ||
      !ivValue ||
      !authTagValue ||
      !cipherTextValue
    ) {
      throw new InternalServerErrorException(
        'Nguồn camera đã mã hoá không hợp lệ.',
      );
    }

    const key = this.getKey();
    try {
      const iv = Buffer.from(ivValue, 'base64url');
      const authTag = Buffer.from(authTagValue, 'base64url');
      const cipherText = Buffer.from(cipherTextValue, 'base64url');
      if (
        iv.length !== IV_LENGTH ||
        authTag.length !== AUTH_TAG_LENGTH ||
        cipherText.length === 0
      ) {
        throw new Error('invalid encrypted camera source shape');
      }

      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(cipherText),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Không thể giải mã nguồn camera.',
      );
    }
  }

  private getKey(): Buffer {
    const configuredKey = this.configService.get<string>(CONFIG_KEY);
    if (!configuredKey || !/^[0-9a-fA-F]{64}$/.test(configuredKey)) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình khoá mã hoá nguồn camera livestream.',
      );
    }

    return Buffer.from(configuredKey, 'hex');
  }
}
