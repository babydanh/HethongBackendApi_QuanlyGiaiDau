import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ZaloTemplateData = Record<string, string>;

export type ZaloSendResult =
  | { ok: true; messageId: string }
  | { ok: false; retryable: boolean; code: string };

export interface ZaloTemplateMessageInput {
  phone: string;
  templateData: ZaloTemplateData;
  trackingId: string;
}

function normalizeVietnamesePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (/^0\d{9,10}$/.test(digits)) return `84${digits.slice(1)}`;
  if (/^84\d{9,10}$/.test(digits)) return digits;
  return null;
}

@Injectable()
export class ZaloBusinessService {
  private readonly logger = new Logger(ZaloBusinessService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<boolean>('ZALO_ENABLED') === true &&
        this.config.get<string>('ZALO_BUSINESS_ACCESS_TOKEN')?.trim() &&
        this.config.get<string>('ZALO_BUSINESS_TEMPLATE_ID')?.trim(),
    );
  }

  async sendTemplateMessage(input: ZaloTemplateMessageInput): Promise<ZaloSendResult> {
    if (!this.isConfigured()) {
      return { ok: false, retryable: false, code: 'ZALO_NOT_CONFIGURED' };
    }
    const phone = normalizeVietnamesePhone(input.phone);
    if (!phone) return { ok: false, retryable: false, code: 'INVALID_OWNER_PHONE' };

    const endpoint = this.config.get<string>('ZALO_BUSINESS_API_URL') || 'https://business.openapi.zalo.me/message/template';
    const timeoutMs = this.config.get<number>('ZALO_REQUEST_TIMEOUT_MS') ?? 10000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          access_token: this.config.get<string>('ZALO_BUSINESS_ACCESS_TOKEN')!.trim(),
        },
        body: JSON.stringify({
          phone,
          template_id: this.config.get<string>('ZALO_BUSINESS_TEMPLATE_ID')!.trim(),
          template_data: input.templateData,
          tracking_id: input.trackingId,
        }),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as { error?: number; data?: { message_id?: string } } | null;
      if (response.ok && payload?.error === 0 && payload.data?.message_id) {
        return { ok: true, messageId: payload.data.message_id };
      }
      const providerCode = payload?.error != null ? `ZALO_${payload.error}` : `HTTP_${response.status}`;
      return {
        ok: false,
        retryable: response.status === 429 || response.status >= 500,
        code: providerCode,
      };
    } catch (error) {
      const code = (error as { name?: string }).name === 'AbortError' ? 'ZALO_TIMEOUT' : 'ZALO_NETWORK_ERROR';
      this.logger.warn(`${code} trackingId=${input.trackingId}`);
      return { ok: false, retryable: true, code };
    } finally {
      clearTimeout(timeout);
    }
  }
}
