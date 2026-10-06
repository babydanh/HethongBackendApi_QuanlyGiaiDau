import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AqvisionApiClient } from './aqvision-api.client';
import { AqvisionApiException } from './aqvision-api.client';
import { AqvisionHealthService } from './aqvision-health.service';

/**
 * Mock client: KHÔNG gọi mạng thật. `global.fetch` cũng bị chặn
 * để chứng minh lớp này không tự nói chuyện HTTP.
 */
describe('AqvisionHealthService', () => {
  const STREAM = 'camera_court01_ab12cd34';
  let isMediaOnline: jest.Mock;
  let service: AqvisionHealthService;
  let fetchSpy: jest.Mock;

  beforeEach(() => {
    isMediaOnline = jest.fn();
    const client = { isMediaOnline } as unknown as AqvisionApiClient;
    service = new AqvisionHealthService(client);
    fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  describe('checkStreamOnline', () => {
    it('tra ve online=true tu client', async () => {
      isMediaOnline.mockResolvedValue({ online: true });

      await expect(service.checkStreamOnline(STREAM)).resolves.toBe(true);
      expect(isMediaOnline).toHaveBeenCalledWith(STREAM);
    });

    it('tra ve online=false tu client', async () => {
      isMediaOnline.mockResolvedValue({ online: false });

      await expect(service.checkStreamOnline(STREAM)).resolves.toBe(false);
    });
  });

  describe('shouldTransition (logic thuan, khong I/O)', () => {
    it('online=true + IDLE => LIVE', () => {
      expect(service.shouldTransition('IDLE', true)).toBe('LIVE');
    });

    it('online=true + LIVE => null (giu nguyen)', () => {
      expect(service.shouldTransition('LIVE', true)).toBeNull();
    });

    it('online=false + LIVE => ENDED', () => {
      expect(service.shouldTransition('LIVE', false)).toBe('ENDED');
    });

    it('online=false + IDLE => null (giu nguyen)', () => {
      expect(service.shouldTransition('IDLE', false)).toBeNull();
    });
  });

  describe('pollStream', () => {
    it('online=true khi IDLE => LIVE, stream = ten stream AQP', async () => {
      isMediaOnline.mockResolvedValue({ online: true });

      await expect(service.pollStream(STREAM, 'IDLE')).resolves.toEqual({
        nextStatus: 'LIVE',
        stream: STREAM,
      });
    });

    it('online=true khi LIVE => null', async () => {
      isMediaOnline.mockResolvedValue({ online: true });

      await expect(service.pollStream(STREAM, 'LIVE')).resolves.toEqual({
        nextStatus: null,
        stream: STREAM,
      });
    });

    it('online=false khi LIVE => ENDED', async () => {
      isMediaOnline.mockResolvedValue({ online: false });

      await expect(service.pollStream(STREAM, 'LIVE')).resolves.toEqual({
        nextStatus: 'ENDED',
        stream: STREAM,
      });
    });

    it('online=false khi IDLE => null', async () => {
      isMediaOnline.mockResolvedValue({ online: false });

      await expect(service.pollStream(STREAM, 'IDLE')).resolves.toEqual({
        nextStatus: null,
        stream: STREAM,
      });
    });

    it('client nem AqvisionApiException => null va KHONG nem ra ngoai', async () => {
      isMediaOnline.mockRejectedValue(
        new AqvisionApiException(-100, 'AQP request failed'),
      );

      await expect(service.pollStream(STREAM, 'IDLE')).resolves.toEqual({
        nextStatus: null,
        stream: STREAM,
      });
    });

    it('loi khac AqvisionApiException => nem ra ngoai', async () => {
      isMediaOnline.mockRejectedValue(new Error('network down'));

      await expect(service.pollStream(STREAM, 'IDLE')).rejects.toThrow(
        'network down',
      );
    });
  });

  describe('log WARN khi API loi (INV-001)', () => {
    it('log chi chua stream + providerCode, KHONG chua secret/query/URL', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      isMediaOnline.mockRejectedValue(
        // Cố tình nhét secret-like text vào message: phải bị chặn không log.
        new AqvisionApiException(
          -400,
          'Incorrect secret signature=abc&vhost=live',
        ),
      );

      await service.pollStream(STREAM, 'LIVE');

      const logged = warnSpy.mock.calls.map((call) => String(call[0])).join(' ');
      expect(logged).toContain(STREAM);
      expect(logged).toContain('-400');
      expect(logged).not.toContain('secret');
      expect(logged).not.toContain('signature');
      expect(logged).not.toContain('http');
      expect(logged).not.toContain('?');
      warnSpy.mockRestore();
    });

    it('khong log gi khi API thanh cong', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      isMediaOnline.mockResolvedValue({ online: true });

      await service.pollStream(STREAM, 'IDLE');

      expect(warnSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
