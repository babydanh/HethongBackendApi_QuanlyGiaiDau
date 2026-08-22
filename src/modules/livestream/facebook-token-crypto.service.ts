import {
  InternalServerErrorException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SERIALIZED_VERSION = 'v1';

@Injectable()
export class FacebookTokenCryptoService {
  constructor(private readonly configService: ConfigService) {}

  encrypt(plainText: string): string {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const cipherText = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      SERIALIZED_VERSION,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      cipherText.toString('base64url'),
    ].join('.');
  }

  decrypt(serialized: string): string {
    const [version, ivValue, authTagValue, cipherTextValue] = serialized.split('.');
    if (
      version !== SERIALIZED_VERSION ||
      !ivValue ||
      !authTagValue ||
      !cipherTextValue
    ) {
      throw new InternalServerErrorException('Facebook token không hợp lệ.');
    }

    try {
      const key = this.getKey();
      const iv = Buffer.from(ivValue, 'base64url');
      const authTag = Buffer.from(authTagValue, 'base64url');
      const cipherText = Buffer.from(cipherTextValue, 'base64url');

      if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH || cipherText.length === 0) {
        throw new Error('invalid encrypted token shape');
      }

      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
    } catch {
      throw new InternalServerErrorException('Facebook token không thể giải mã.');
    }
  }

  private getKey(): Buffer {
    const configuredKey = this.configService.get<string>('FACEBOOK_PAGE_TOKEN_ENCRYPTION_KEY');
    if (!configuredKey) {
      throw new ServiceUnavailableException('Tính năng Facebook chưa được cấu hình bảo mật.');
    }

    const key = /^[0-9a-fA-F]{64}$/.test(configuredKey)
      ? Buffer.from(configuredKey, 'hex')
      : Buffer.from(configuredKey, 'base64');

    if (key.length !== 32) {
      throw new ServiceUnavailableException('Tính năng Facebook chưa được cấu hình bảo mật.');
    }

    return key;
  }
}
