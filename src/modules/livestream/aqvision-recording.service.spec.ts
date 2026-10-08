import {
  AqvisionApiClient,
  AqvisionApiException,
} from './aqvision-api.client';
import {
  AqvisionRecordingService,
  type AqvisionRecordFile,
} from './aqvision-recording.service';
import type { LivestreamRepository } from './livestream.repository';
import type { CameraLeaseHandle, LivestreamHealthQueue } from './livestream-health.queue';
/**
 * Mock cứng `AqvisionApiClient` (KHÔNG gọi mạng thật).
 * INV-001: KHÔNG log URL/query string — test chỉ kiểm tra payload trả về.
 */
type RecordingClientMock = {
  getMp4RecordFile: jest.Mock;
  isMediaOnline: jest.Mock;
  isRecordingMp4: jest.Mock;
  startRecordMp4: jest.Mock;
  stopRecordMp4: jest.Mock;
};

type RecordingRepositoryMock = {
  findCameraRecordingTarget: jest.Mock;
};

type RecordingQueueMock = {
  runWithCameraLock: jest.Mock;
  scheduleCameraOfflineConfirmation: jest.Mock;
  cancelCameraOfflineConfirmation: jest.Mock;
};

function makeLeaseHandle(
  isOwned: () => boolean = () => true,
): CameraLeaseHandle {
  return { cameraId: 'camera-1', isOwned };
}

function makeService(
  getMp4RecordFile: jest.Mock = jest.fn(),
  overrides?: {
    client?: Partial<RecordingClientMock>;
    repository?: Partial<RecordingRepositoryMock>;
    queue?: Partial<RecordingQueueMock>;
  },
): {
  service: AqvisionRecordingService;
  client: RecordingClientMock;
  repository: RecordingRepositoryMock;
  queue: RecordingQueueMock;
} {
  const client: RecordingClientMock = {
    getMp4RecordFile,
    isMediaOnline: jest.fn(),
    isRecordingMp4: jest.fn(),
    startRecordMp4: jest.fn(),
    stopRecordMp4: jest.fn(),
    ...overrides?.client,
  };
  const repository: RecordingRepositoryMock = {
    findCameraRecordingTarget: jest.fn(),
    ...overrides?.repository,
  };
  const queue: RecordingQueueMock = {
    runWithCameraLock: jest.fn(),
    scheduleCameraOfflineConfirmation: jest
      .fn()
      .mockResolvedValue(undefined),
    cancelCameraOfflineConfirmation: jest
      .fn()
      .mockResolvedValue(undefined),
    ...overrides?.queue,
  };
  // Cast chữ ký tạo 3 dependency: file test chạy được cả trước và sau
  // khi service nhận thêm repository/queue (Task 2).
  const RecordingServiceCtor =
    AqvisionRecordingService as unknown as new (
      client: AqvisionApiClient,
      repository: LivestreamRepository,
      queue: LivestreamHealthQueue,
    ) => AqvisionRecordingService;
  const service = new RecordingServiceCtor(
    client as unknown as AqvisionApiClient,
    repository as unknown as LivestreamRepository,
    queue as unknown as LivestreamHealthQueue,
  );
  return { service, client, repository, queue };
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

  describe('reconcileCamera', () => {
    const liveTarget = {
      cameraId: 'camera-1',
      streamName: 'stream-1',
      hasLiveAssignment: true,
    };

    it('media online + assignment LIVE + chua ghi => startRecordMp4(streamName), tra RECORDING', async () => {
      const { service, client, repository, queue } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
        },
        client: {
          isMediaOnline: jest.fn().mockResolvedValue({ online: true }),
          isRecordingMp4: jest.fn().mockResolvedValue(false),
        },
      });

      const status = await service.reconcileCamera('camera-1', makeLeaseHandle());

      expect(status).toBe('RECORDING');
      expect(client.startRecordMp4).toHaveBeenCalledTimes(1);
      expect(client.startRecordMp4).toHaveBeenCalledWith('stream-1');
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
      // Media online: job xac nhan offline (ne co) duoc huy.
      expect(queue.cancelCameraOfflineConfirmation).toHaveBeenCalledWith(
        'camera-1',
      );
      expect(queue.scheduleCameraOfflineConfirmation).not.toHaveBeenCalled();
    });

    it('da ghi roi => khong goi startRecordMp4, tra RECORDING', async () => {
      const { service, client, repository } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
        },
        client: {
          isMediaOnline: jest.fn().mockResolvedValue({ online: true }),
          isRecordingMp4: jest.fn().mockResolvedValue(true),
        },
      });

      const status = await service.reconcileCamera('camera-1', makeLeaseHandle());

      expect(status).toBe('RECORDING');
      expect(client.startRecordMp4).not.toHaveBeenCalled();
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
    });

    it('media offline + assignment LIVE => len job xac nhan, khong start/stop, tra PENDING', async () => {
      const { service, client, repository, queue } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
        },
        client: {
          isMediaOnline: jest.fn().mockResolvedValue({ online: false }),
        },
      });

      const status = await service.reconcileCamera('camera-1', makeLeaseHandle());

      expect(status).toBe('PENDING');
      expect(queue.scheduleCameraOfflineConfirmation).toHaveBeenCalledWith(
        'camera-1',
      );
      // Chưa qua grace period: không phát lệnh ghi nào cho provider.
      expect(client.startRecordMp4).not.toHaveBeenCalled();
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
      expect(client.isRecordingMp4).not.toHaveBeenCalled();
    });

    it('khong con assignment LIVE + dang ghi => stopRecordMp4(streamName), tra STOPPED', async () => {
      const { service, client, repository, queue } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest
            .fn()
            .mockResolvedValue({ ...liveTarget, hasLiveAssignment: false }),
        },
        client: {
          isRecordingMp4: jest.fn().mockResolvedValue(true),
        },
      });

      const status = await service.reconcileCamera('camera-1', makeLeaseHandle());

      expect(status).toBe('STOPPED');
      expect(client.stopRecordMp4).toHaveBeenCalledTimes(1);
      expect(client.stopRecordMp4).toHaveBeenCalledWith('stream-1');
      expect(client.startRecordMp4).not.toHaveBeenCalled();
      // Hết assignment LIVE: job xác nhận offline không còn ý nghĩa.
      expect(queue.cancelCameraOfflineConfirmation).toHaveBeenCalledWith(
        'camera-1',
      );
    });

    it('khong con assignment LIVE + chua ghi => khong goi stopRecord, tra STOPPED', async () => {
      const { service, client, repository } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest
            .fn()
            .mockResolvedValue({ ...liveTarget, hasLiveAssignment: false }),
        },
        client: {
          isRecordingMp4: jest.fn().mockResolvedValue(false),
        },
      });

      const status = await service.reconcileCamera('camera-1', makeLeaseHandle());

      expect(status).toBe('STOPPED');
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
    });

    it('khong tim thay projection (camera/assignment da xoá) => STOPPED, khong goi provider', async () => {
      const { service, client, repository } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest.fn().mockResolvedValue(null),
        },
      });

      const status = await service.reconcileCamera('camera-1', makeLeaseHandle());

      expect(status).toBe('STOPPED');
      expect(repository.findCameraRecordingTarget).toHaveBeenCalledWith(
        'camera-1',
      );
      expect(client.isMediaOnline).not.toHaveBeenCalled();
      expect(client.isRecordingMp4).not.toHaveBeenCalled();
      expect(client.startRecordMp4).not.toHaveBeenCalled();
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
    });

    it('loi provider (isMediaOnline) => nem qua, khong start/stop, message khong chua secret/URL', async () => {
      const failure = new AqvisionApiException(
        -100,
        'AQP isMediaOnline that bai.',
      );
      const { service, client, repository } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
        },
        client: {
          isMediaOnline: jest.fn().mockRejectedValue(failure),
        },
      });

      await expect(service.reconcileCamera('camera-1', makeLeaseHandle())).rejects.toBe(failure);

      expect(client.startRecordMp4).not.toHaveBeenCalled();
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
      // INV-001: message đã làm sạch — không secret, không URL/query.
      expect(failure.message).not.toMatch(/secret|https?:|\?/);
    });
  });

  describe('confirmCameraOffline', () => {
    const liveTarget = {
      cameraId: 'camera-1',
      streamName: 'stream-1',
      hasLiveAssignment: true,
    };

    it('media online lai truoc khi job chay => khong stop, ghi tiep neu can (reconnect)', async () => {
      const { service, client, repository, queue } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
        },
        client: {
          isMediaOnline: jest.fn().mockResolvedValue({ online: true }),
          isRecordingMp4: jest.fn().mockResolvedValue(false),
        },
      });

      const status = await service.confirmCameraOffline('camera-1', makeLeaseHandle());

      expect(status).toBe('RECORDING');
      // Camera sống lại: tuyệt đối không dừng bản ghi.
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
      expect(queue.scheduleCameraOfflineConfirmation).not.toHaveBeenCalled();
      // Chưa ghi mà media online + còn trận LIVE => bắt đầu lại.
      expect(client.startRecordMp4).toHaveBeenCalledTimes(1);
      expect(client.startRecordMp4).toHaveBeenCalledWith('stream-1');
    });

    it('khong con assignment LIVE => khong stop ngay ca khi provider dang ghi, tra PENDING', async () => {
      const { service, client, repository } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest
            .fn()
            .mockResolvedValue({ ...liveTarget, hasLiveAssignment: false }),
        },
        client: {
          isRecordingMp4: jest.fn().mockResolvedValue(true),
        },
      });

      const status = await service.confirmCameraOffline('camera-1', makeLeaseHandle());

      expect(status).toBe('PENDING');
      // Job xác nhận không phải đường dừng ghi: sweep/reconcile mới dừng.
      expect(client.isMediaOnline).not.toHaveBeenCalled();
      expect(client.isRecordingMp4).not.toHaveBeenCalled();
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
    });

    it('van offline sau grace period + dang ghi => stopRecordMp4(streamName), tra STOPPED', async () => {
      const { service, client, repository } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
        },
        client: {
          isMediaOnline: jest.fn().mockResolvedValue({ online: false }),
          isRecordingMp4: jest.fn().mockResolvedValue(true),
        },
      });

      const status = await service.confirmCameraOffline('camera-1', makeLeaseHandle());

      expect(status).toBe('STOPPED');
      expect(client.stopRecordMp4).toHaveBeenCalledTimes(1);
      expect(client.stopRecordMp4).toHaveBeenCalledWith('stream-1');
    });

    it('van offline sau grace period + chua ghi => khong stop, tra STOPPED', async () => {
      const { service, client, repository } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
        },
        client: {
          isMediaOnline: jest.fn().mockResolvedValue({ online: false }),
          isRecordingMp4: jest.fn().mockResolvedValue(false),
        },
      });

      const status = await service.confirmCameraOffline('camera-1', makeLeaseHandle());

      expect(status).toBe('STOPPED');
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
    });

    it('khong tim thay projection => PENDING, khong goi provider', async () => {
      const { service, client, repository } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest.fn().mockResolvedValue(null),
        },
      });

      const status = await service.confirmCameraOffline('camera-1', makeLeaseHandle());

      expect(status).toBe('PENDING');
      expect(client.isMediaOnline).not.toHaveBeenCalled();
      expect(client.isRecordingMp4).not.toHaveBeenCalled();
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
    });

    it('loi provider (isMediaOnline) => nem qua, khong stop, message khong chua secret/URL', async () => {
      const failure = new AqvisionApiException(
        -400,
        'AQP isMediaOnline that bai.',
      );
      const { service, client, repository } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
        },
        client: {
          isMediaOnline: jest.fn().mockRejectedValue(failure),
        },
      });

      await expect(service.confirmCameraOffline('camera-1', makeLeaseHandle())).rejects.toBe(
        failure,
      );

      expect(client.stopRecordMp4).not.toHaveBeenCalled();
      expect(failure.message).not.toMatch(/secret|https?:|\?/);
    });
  });

  describe('race mất lease giữa operation (runWithCameraLock)', () => {
    const liveTarget = {
      cameraId: 'camera-1',
      streamName: 'stream-1',
      hasLiveAssignment: true,
    };

    /**
     * Mô phỏng race với `runWithCameraLock`: lease còn
     * khi operation bắt đầu, mất khi `loseLease()`
     * được gọi (gia hạn trả 0 / lỗi Redis — đúng khi
     * một await trả về). Coordinate phải kiểm tra quyền
     * sở hữu trước mọi provider read/side effect tiếp
     * theo và trả `PENDING`.
     */
    function leaseLostOnDemand(): {
      handle: CameraLeaseHandle;
      isOwned: jest.Mock;
      loseLease: () => void;
    } {
      let leaseLost = false;
      const isOwned = jest.fn().mockImplementation(() => !leaseLost);
      return {
        handle: { cameraId: 'camera-1', isOwned },
        isOwned,
        loseLease: (): void => {
          leaseLost = true;
        },
      };
    }

    it('reconcileCamera: mất lease khi isRecordingMp4 trả về (media online) => không startRecordMp4, tra PENDING', async () => {
      const lease = leaseLostOnDemand();
      const { service, client, repository, queue } = makeService(
        jest.fn(),
        {
          repository: {
            findCameraRecordingTarget:
              jest.fn().mockResolvedValue(liveTarget),
          },
          client: {
            isMediaOnline: jest.fn().mockResolvedValue({ online: true }),
            isRecordingMp4: jest.fn().mockImplementation(async () => {
              lease.loseLease();
              return false;
            }),
          },
        },
      );

      const status = await service.reconcileCamera('camera-1', lease.handle);

      expect(status).toBe('PENDING');
      expect(lease.isOwned).toHaveBeenCalled();
      // Mất quyền sở hữu lease: tuyệt đối không phát lệnh ghi tiếp.
      expect(client.startRecordMp4).not.toHaveBeenCalled();
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
    });

    it('reconcileCamera: mất lease khi isRecordingMp4 trả về (hết assignment LIVE) => không stopRecordMp4, tra PENDING', async () => {
      const lease = leaseLostOnDemand();
      const { service, client, repository } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest
            .fn()
            .mockResolvedValue({ ...liveTarget, hasLiveAssignment: false }),
        },
        client: {
          isRecordingMp4: jest.fn().mockImplementation(async () => {
            lease.loseLease();
            return true;
          }),
        },
      });

      const status = await service.reconcileCamera('camera-1', lease.handle);

      expect(status).toBe('PENDING');
      // Mất quyền sở hữu lease: tuyệt đối không phát lệnh dừng.
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
      expect(client.startRecordMp4).not.toHaveBeenCalled();
    });

    it('reconcileCamera: mất lease khi isMediaOnline trả về (media offline) => không schedule job xác nhận, tra PENDING', async () => {
      const lease = leaseLostOnDemand();
      const { service, client, repository, queue } = makeService(
        jest.fn(),
        {
          repository: {
            findCameraRecordingTarget:
              jest.fn().mockResolvedValue(liveTarget),
          },
          client: {
            isMediaOnline: jest.fn().mockImplementation(async () => {
              lease.loseLease();
              return { online: false };
            }),
          },
        },
      );

      const status = await service.reconcileCamera('camera-1', lease.handle);

      expect(status).toBe('PENDING');
      // Mất quyền sở hữu lease: không phát lệnh queue tiếp theo.
      expect(queue.scheduleCameraOfflineConfirmation).not.toHaveBeenCalled();
      expect(queue.cancelCameraOfflineConfirmation).not.toHaveBeenCalled();
      expect(client.startRecordMp4).not.toHaveBeenCalled();
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
    });

    it('confirmCameraOffline: mất lease khi isRecordingMp4 trả về => không stopRecordMp4, tra PENDING', async () => {
      const lease = leaseLostOnDemand();
      const { service, client, repository } = makeService(jest.fn(), {
        repository: {
          findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
        },
        client: {
          isMediaOnline: jest.fn().mockResolvedValue({ online: false }),
          isRecordingMp4: jest.fn().mockImplementation(async () => {
            lease.loseLease();
            return true;
          }),
        },
      });

      const status = await service.confirmCameraOffline('camera-1', lease.handle);

      expect(status).toBe('PENDING');
      // Mất quyền sở hữu lease: tuyệt đối không phát lệnh dừng.
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
      expect(client.startRecordMp4).not.toHaveBeenCalled();
    });

    it('reconcileCamera: mất lease sau repository lookup => không isMediaOnline, tra PENDING', async () => {
      const lease = leaseLostOnDemand();
      const { service, client, repository, queue } = makeService(
        jest.fn(),
        {
          repository: {
            findCameraRecordingTarget: jest.fn().mockImplementation(
              async () => {
                lease.loseLease();
                return liveTarget;
              },
            ),
          },
          client: {
            isMediaOnline: jest.fn().mockResolvedValue({ online: true }),
            isRecordingMp4: jest.fn().mockResolvedValue(false),
          },
        },
      );

      const status = await service.reconcileCamera('camera-1', lease.handle);

      expect(status).toBe('PENDING');
      // Mất lease sau repository read: không phát provider read tiếp.
      expect(client.isMediaOnline).not.toHaveBeenCalled();
      expect(client.isRecordingMp4).not.toHaveBeenCalled();
      expect(queue.cancelCameraOfflineConfirmation).not.toHaveBeenCalled();
    });

    it('reconcileCamera (hết assignment LIVE): mất lease sau cancel job => không isRecordingMp4, tra PENDING', async () => {
      const lease = leaseLostOnDemand();
      const { service, client, repository, queue } = makeService(
        jest.fn(),
        {
          repository: {
            findCameraRecordingTarget: jest
              .fn()
              .mockResolvedValue({ ...liveTarget, hasLiveAssignment: false }),
          },
          client: {
            isRecordingMp4: jest.fn().mockResolvedValue(true),
          },
          queue: {
            cancelCameraOfflineConfirmation: jest.fn().mockImplementation(
              async () => {
                lease.loseLease();
              },
            ),
          },
        },
      );

      const status = await service.reconcileCamera('camera-1', lease.handle);

      expect(status).toBe('PENDING');
      // Mất lease sau queue cancel: không phát provider read tiếp.
      expect(client.isRecordingMp4).not.toHaveBeenCalled();
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
    });

    it('reconcileCamera (media online): mất lease sau cancel job => không isRecordingMp4, tra PENDING', async () => {
      const lease = leaseLostOnDemand();
      const { service, client, repository, queue } = makeService(
        jest.fn(),
        {
          repository: {
            findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
          },
          client: {
            isMediaOnline: jest.fn().mockResolvedValue({ online: true }),
            isRecordingMp4: jest.fn().mockResolvedValue(false),
          },
          queue: {
            cancelCameraOfflineConfirmation: jest.fn().mockImplementation(
              async () => {
                lease.loseLease();
              },
            ),
          },
        },
      );

      const status = await service.reconcileCamera('camera-1', lease.handle);

      expect(status).toBe('PENDING');
      // Mất lease sau queue cancel: không phát provider read tiếp.
      expect(client.isRecordingMp4).not.toHaveBeenCalled();
      expect(client.startRecordMp4).not.toHaveBeenCalled();
    });

    it('confirmCameraOffline: mất lease sau repository lookup => không isMediaOnline, tra PENDING', async () => {
      const lease = leaseLostOnDemand();
      const { service, client, repository, queue } = makeService(
        jest.fn(),
        {
          repository: {
            findCameraRecordingTarget: jest.fn().mockImplementation(
              async () => {
                lease.loseLease();
                return liveTarget;
              },
            ),
          },
          client: {
            isMediaOnline: jest.fn().mockResolvedValue({ online: false }),
            isRecordingMp4: jest.fn().mockResolvedValue(true),
          },
        },
      );

      const status = await service.confirmCameraOffline('camera-1', lease.handle);

      expect(status).toBe('PENDING');
      // Mất lease sau repository read: không phát provider read tiếp.
      expect(client.isMediaOnline).not.toHaveBeenCalled();
      expect(client.isRecordingMp4).not.toHaveBeenCalled();
    });

    it('confirmCameraOffline (media online lại): mất lease sau isMediaOnline => không uỷ reconcileCamera, tra PENDING', async () => {
      const lease = leaseLostOnDemand();
      const { service, client, repository, queue } = makeService(
        jest.fn(),
        {
          repository: {
            findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
          },
          client: {
            isMediaOnline: jest.fn().mockImplementation(async () => {
              lease.loseLease();
              return { online: true };
            }),
            isRecordingMp4: jest.fn().mockResolvedValue(false),
          },
        },
      );

      const status = await service.confirmCameraOffline('camera-1', lease.handle);

      expect(status).toBe('PENDING');
      // Mất lease sau isMediaOnline: không uỷ reconcileCamera
      // (sẽ gọi isMediaOnline lần 2) cũng không phát read tiếp.
      expect(client.isMediaOnline).toHaveBeenCalledTimes(1);
      expect(client.isRecordingMp4).not.toHaveBeenCalled();
      expect(client.startRecordMp4).not.toHaveBeenCalled();
    });

    it('confirmCameraOffline (vẫn offline): mất lease sau isMediaOnline => không isRecordingMp4, tra PENDING', async () => {
      const lease = leaseLostOnDemand();
      const { service, client, repository, queue } = makeService(
        jest.fn(),
        {
          repository: {
            findCameraRecordingTarget: jest.fn().mockResolvedValue(liveTarget),
          },
          client: {
            isMediaOnline: jest.fn().mockImplementation(async () => {
              lease.loseLease();
              return { online: false };
            }),
            isRecordingMp4: jest.fn().mockResolvedValue(true),
          },
        },
      );

      const status = await service.confirmCameraOffline('camera-1', lease.handle);

      expect(status).toBe('PENDING');
      // Mất lease sau isMediaOnline: không phát provider read tiếp.
      expect(client.isRecordingMp4).not.toHaveBeenCalled();
      expect(client.stopRecordMp4).not.toHaveBeenCalled();
    });
  });
});
