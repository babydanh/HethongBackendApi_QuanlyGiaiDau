import { AqvisionApiClient } from './aqvision-api.client';
import {
  AqvisionRecordingService,
  type AqvisionRecordFile,
} from './aqvision-recording.service';

/**
 * Mock cứng `AqvisionApiClient.getMp4RecordFile` (KHÔNG gọi mạng thật).
 * INV-001: KHÔNG log URL/query string — test chỉ kiểm tra payload trả về.
 */
function makeService(
  getMp4RecordFile: jest.Mock,
): { service: AqvisionRecordingService; client: AqvisionApiClient } {
  const client = {
    getMp4RecordFile,
  } as unknown as AqvisionApiClient;
  const service = new AqvisionRecordingService(client);
  return { service, client };
}

/** Bắt client mock KHÔNG được nhận `period`/`withSize` ngoài mong đợi. */
function expectGetMp4Call(
  getMp4RecordFile: jest.Mock,
  expected: Record<string, unknown>,
): void {
  expect(getMp4RecordFile).toHaveBeenCalledTimes(1);
  expect(getMp4RecordFile).toHaveBeenCalledWith(expected);
}

describe('AqvisionRecordingService', () => {
  describe('listRecordDays', () => {
    it('goi KHONG period => tra danh sach ten thu muc ngay', async () => {
      const getMp4RecordFile = jest
        .fn()
        .mockResolvedValue({ paths: ['2026-10-01', '2026-10-02'], rootPath: '/www/live/ss/' });

      const { service } = makeService(getMp4RecordFile);

      const days = await service.listRecordDays('camera01');

      expect(days).toEqual(['2026-10-01', '2026-10-02']);
      // Không truyền period ⇒ AQP liệt kê thư mục ngày.
      expectGetMp4Call(getMp4RecordFile, { stream: 'camera01' });
    });

    it('paths rong => tra mang rong, kh nem', async () => {
      const getMp4RecordFile = jest
        .fn()
        .mockResolvedValue({ paths: [], rootPath: '' });

      const { service } = makeService(getMp4RecordFile);

      expect(await service.listRecordDays('camera01')).toEqual([]);
    });

    it('loi AQP (AqvisionApiException) => nem qua, kh bi doi', async () => {
      const failure = new Error('AQP từ chối (code -100)');
      const getMp4RecordFile = jest.fn().mockRejectedValue(failure);

      const { service } = makeService(getMp4RecordFile);

      await expect(service.listRecordDays('camera01')).rejects.toBe(failure);
    });
  });

  describe('listRecordFiles', () => {
    it('co period + withSize => danh sach file, ghep sizeBytes theo ten', async () => {
      const getMp4RecordFile = jest.fn().mockResolvedValue({
        paths: ['22-20-30.mp4', '22-13-12.mp4'],
        rootPath: '/www/live/ss/2026-10-04/',
        files: [
          { name: '22-20-30.mp4', sizeBytes: 1048576 },
          { name: '22-13-12.mp4', sizeBytes: 524288 },
        ],
      });

      const { service } = makeService(getMp4RecordFile);

      const files = await service.listRecordFiles('camera01', '2026-10-04');

      expect(files).toEqual([
        { name: '22-20-30.mp4', sizeBytes: 1048576 },
        { name: '22-13-12.mp4', sizeBytes: 524288 },
      ]);
      expectGetMp4Call(getMp4RecordFile, {
        stream: 'camera01',
        period: '2026-10-04',
        withSize: true,
      });
    });

    it('file thieu trong files[] => sizeBytes undefined (KHONG bia 0)', async () => {
      const getMp4RecordFile = jest.fn().mockResolvedValue({
        paths: ['22-20-30.mp4', '22-13-12.mp4'],
        rootPath: '/www/live/ss/2026-10-04/',
        // `22-13-12.mp4` có trong paths nhưng KHÔNG có trong files.
        files: [{ name: '22-20-30.mp4', sizeBytes: 1048576 }],
      });

      const { service } = makeService(getMp4RecordFile);

      const files = await service.listRecordFiles('camera01', '2026-10-04');

      expect(files[0]).toEqual({ name: '22-20-30.mp4', sizeBytes: 1048576 });
      expect(files[1]?.name).toBe('22-13-12.mp4');
      expect(files[1]?.sizeBytes).toBeUndefined();
      // KHÔNG bịa 0.
      expect(files[1]?.sizeBytes).not.toBe(0);
    });

    it('client khong tra files (withSize that bai) => toan bo sizeBytes undefined', async () => {
      const getMp4RecordFile = jest.fn().mockResolvedValue({
        paths: ['22-20-30.mp4'],
        rootPath: '/www/live/ss/2026-10-04/',
        // AQP không trả `files` kèm.
        files: undefined,
      });

      const { service } = makeService(getMp4RecordFile);

      const files: AqvisionRecordFile[] = await service.listRecordFiles(
        'camera01',
        '2026-10-04',
      );

      expect(files).toEqual([{ name: '22-20-30.mp4' }]);
      expect(files[0]?.sizeBytes).toBeUndefined();
    });

    it('giu thu tu cua paths, khong theo thu tu files', async () => {
      const getMp4RecordFile = jest.fn().mockResolvedValue({
        paths: ['b.mp4', 'a.mp4'],
        rootPath: '/www/live/ss/2026-10-04/',
        files: [
          { name: 'a.mp4', sizeBytes: 10 },
          { name: 'b.mp4', sizeBytes: 20 },
        ],
      });

      const { service } = makeService(getMp4RecordFile);

      const files = await service.listRecordFiles('camera01', '2026-10-04');

      expect(files.map((f) => f.name)).toEqual(['b.mp4', 'a.mp4']);
      expect(files[0]?.sizeBytes).toBe(20);
      expect(files[1]?.sizeBytes).toBe(10);
    });
  });

  describe('buildStoragePath', () => {
    it('rootPath that trailing slash => khong them slash thua', () => {
      const { service } = makeService(jest.fn());

      const path = service.buildStoragePath(
        '/www/live/ss/2020-01-24/',
        '2020-01-24',
        '22-20-30.mp4',
      );

      expect(path).toBe('/www/live/ss/2020-01-24/2020-01-24/22-20-30.mp4');
    });

    it('rootPath khong trailing slash => them dung mot slash', () => {
      const { service } = makeService(jest.fn());

      expect(
        service.buildStoragePath('/www/live/ss/2020-01-24', '2020-01-24', 'a.mp4'),
      ).toBe('/www/live/ss/2020-01-24/2020-01-24/a.mp4');
    });

    it('period/fileName co leading slash => khong tang slash kep', () => {
      const { service } = makeService(jest.fn());

      expect(
        service.buildStoragePath('/www/live/ss/', '/2020-01-24/', '/a.mp4'),
      ).toBe('/www/live/ss/2020-01-24/a.mp4');
    });

    it('rootPath rong => ghi nhan period/file thoi', () => {
      const { service } = makeService(jest.fn());

      expect(service.buildStoragePath('', '2020-01-24', 'a.mp4')).toBe(
        '/2020-01-24/a.mp4',
      );
    });
  });
});
