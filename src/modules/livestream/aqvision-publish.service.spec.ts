import type { ConfigService } from '@nestjs/config';
import {
  AqvisionPublishService,
  type AqvisionQrPayload,
  type BuildQrPayloadInput,
} from './aqvision-publish.service';
import { AqvisionApiException } from './aqvision-api.client';

/** Mock ConfigService theo mẫu aqvision-api.client.spec.ts. */
function makeService(values: Record<string, unknown> = {}): AqvisionPublishService {
  const config = {
    get: (key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
  };
  return new AqvisionPublishService(config as unknown as ConfigService);
}

const BASE_INPUT: BuildQrPayloadInput = {
  matchId: 'M-123',
  matchTitle: 'Chung kết',
  publishKey: 'pub-secret-abc',
  pushHost: 'push.example.net',
  pushPort: 18554,
};

describe('AqvisionPublishService', () => {
  describe('buildQrPayload', () => {
    it('trả payload đúng 5 field theo đúng thứ tự docx §2.2', () => {
      const payload = makeService().buildQrPayload(BASE_INPUT);

      expect(Object.keys(payload)).toEqual([
        'stream_url',
        'match_id',
        'match_title',
        'protocol',
        'auto_start',
      ]);
    });

    it('ghép stream_url = rtsp://<pushHost>:<pushPort>/live/<matchId>?key=<publishKey>', () => {
      const payload = makeService().buildQrPayload(BASE_INPUT);

      expect(payload.stream_url).toBe(
        'rtsp://push.example.net:18554/live/M-123?key=pub-secret-abc',
      );
      expect(payload.match_id).toBe('M-123');
      expect(payload.match_title).toBe('Chung kết');
      expect(payload.protocol).toBe('rtsp');
      expect(payload.auto_start).toBe(false);
    });

    it('auto_start = true khi truyền autoStart: true', () => {
      const payload = makeService().buildQrPayload({
        ...BASE_INPUT,
        autoStart: true,
      });

      expect(payload.auto_start).toBe(true);
    });

    it('chấp nhận pushPort dạng string', () => {
      const payload = makeService().buildQrPayload({
        ...BASE_INPUT,
        pushPort: '1935',
      });

      expect(payload.stream_url).toBe(
        'rtsp://push.example.net:1935/live/M-123?key=pub-secret-abc',
      );
    });

    it('trim whitespace ở matchId/publishKey/pushHost', () => {
      const payload = makeService().buildQrPayload({
        ...BASE_INPUT,
        matchId: '  M-123  ',
        publishKey: '  pub-secret-abc  ',
        pushHost: '  push.example.net  ',
      });

      expect(payload.stream_url).toBe(
        'rtsp://push.example.net:18554/live/M-123?key=pub-secret-abc',
      );
    });

    it('thiếu publishKey ⇒ ném AqvisionApiException(-300) — fail-closed', () => {
      const service = makeService();

      expect(() =>
        service.buildQrPayload({ ...BASE_INPUT, publishKey: '' }),
      ).toThrow(AqvisionApiException);

      try {
        service.buildQrPayload({ ...BASE_INPUT, publishKey: '' });
      } catch (error) {
        expect(error).toBeInstanceOf(AqvisionApiException);
        expect((error as AqvisionApiException).providerCode).toBe(-300);
      }
    });

    it('thiếu pushHost ⇒ ném AqvisionApiException(-300)', () => {
      expect(() =>
        makeService().buildQrPayload({ ...BASE_INPUT, pushHost: '' }),
      ).toThrow(AqvisionApiException);
    });

    it('thiếu pushPort ⇒ ném AqvisionApiException(-300)', () => {
      expect(() =>
        makeService().buildQrPayload({ ...BASE_INPUT, pushPort: '' }),
      ).toThrow(AqvisionApiException);
    });

    it('thiếu matchId ⇒ ném AqvisionApiException(-300)', () => {
      expect(() =>
        makeService().buildQrPayload({ ...BASE_INPUT, matchId: '' }),
      ).toThrow(AqvisionApiException);
    });
  });

  describe('resolvePushEndpoint', () => {
    it('đọc pushHost/pushPort từ ConfigService', () => {
      const service = makeService({
        AQVISION_PUSH_HOST: 'media.push.net',
        AQVISION_PUSH_PORT: '18554',
      });

      expect(service.resolvePushEndpoint()).toEqual({
        pushHost: 'media.push.net',
        pushPort: '18554',
      });
    });

    it('env chưa cấu hình ⇒ rỗng (dẫn đến fail-closed)', () => {
      expect(makeService().resolvePushEndpoint()).toEqual({
        pushHost: '',
        pushPort: '',
      });
    });
  });

  describe('buildQrPayloadFromConfig', () => {
    it('ghép payload dùng endpoint từ ConfigService', () => {
      const service = makeService({
        AQVISION_PUSH_HOST: 'media.push.net',
        AQVISION_PUSH_PORT: 18554,
      });

      const payload = service.buildQrPayloadFromConfig({
        matchId: 'M-999',
        matchTitle: 'Vòng bảng',
        publishKey: 'pub-key-xyz',
      });

      expect(payload.stream_url).toBe(
        'rtsp://media.push.net:18554/live/M-999?key=pub-key-xyz',
      );
      expect(payload.protocol).toBe('rtsp');
      expect(payload.auto_start).toBe(false);
    });

    it('env push chưa cấu hình ⇒ ném AqvisionApiException(-300)', () => {
      const service = makeService();

      expect(() =>
        service.buildQrPayloadFromConfig({
          matchId: 'M-999',
          matchTitle: 'Vòng bảng',
          publishKey: 'pub-key-xyz',
        }),
      ).toThrow(AqvisionApiException);
    });
  });

  describe('toQrPayloadString', () => {
    it('round-trip JSON: parse lại được payload gốc', () => {
      const payload: AqvisionQrPayload =
        makeService().buildQrPayload(BASE_INPUT);
      const json = makeService().toQrPayloadString(payload);

      expect(JSON.parse(json)).toEqual(payload);
    });

    it('chuỗi JSON giữ đúng thứ tự field', () => {
      const payload: AqvisionQrPayload =
        makeService().buildQrPayload(BASE_INPUT);
      const json = makeService().toQrPayloadString(payload);

      const order = [
        json.indexOf('"stream_url"'),
        json.indexOf('"match_id"'),
        json.indexOf('"match_title"'),
        json.indexOf('"protocol"'),
        json.indexOf('"auto_start"'),
      ];
      const sorted = [...order].sort((a, b) => a - b);
      expect(order).toEqual(sorted);
    });
  });
});
