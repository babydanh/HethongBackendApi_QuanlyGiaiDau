import { ConfigService } from '@nestjs/config';
import { ZaloBusinessService } from './zalo-business.service';

describe('ZaloBusinessService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('does not call the network when the provider is not configured', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    const config = new ConfigService({ ZALO_ENABLED: false });

    const result = await new ZaloBusinessService(config).sendTemplateMessage({
      phone: '0900000000',
      templateData: { activity_name: 'Giao lưu CLB' },
      trackingId: 'outbox-1',
    });

    expect(result).toEqual({ ok: false, retryable: false, code: 'ZALO_NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normalizes Vietnamese phone and accepts only provider success as sent', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: 0, data: { message_id: 'zalo-message-1' } }),
    });
    global.fetch = fetchMock as typeof fetch;
    const config = new ConfigService({
      ZALO_ENABLED: true,
      ZALO_BUSINESS_ACCESS_TOKEN: 'token-not-printed',
      ZALO_BUSINESS_TEMPLATE_ID: 'template-1',
    });

    const result = await new ZaloBusinessService(config).sendTemplateMessage({
      phone: '0900000000',
      templateData: { activity_name: 'Giao lưu CLB' },
      trackingId: 'outbox-2',
    });

    expect(result).toEqual({ ok: true, messageId: 'zalo-message-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://business.openapi.zalo.me/message/template',
      expect.objectContaining({
        headers: expect.objectContaining({ access_token: 'token-not-printed' }),
        body: expect.stringContaining('84900000000'),
      }),
    );
  });
});
