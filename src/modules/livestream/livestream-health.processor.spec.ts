import type { Job } from 'bullmq';
import { LivestreamHealthProcessor } from './livestream-health.processor';
import type { LivestreamHealthJobData } from './livestream-health.processor';
import type { LivestreamRepository } from './livestream.repository';
import type { CameraLeaseHandle, LivestreamHealthQueue } from './livestream-health.queue';
import type { AqvisionRecordingService } from './aqvision-recording.service';
import type { LiveSessionRepository } from './live-session.repository';
import type { LiveSessionService } from './live-session.service';

interface ProcessorMocks {
  liveSessionRepository: { listActiveLiveSessions: jest.Mock };
  liveSessionService: { checkSessionHealth: jest.Mock };
  livestreamRepository: {
    listCameraRecordingTargets: jest.Mock;
    findCameraRecordingTarget: jest.Mock;
  };
  livestreamHealthQueue: {
    runWithCameraLock: jest.Mock;
    scheduleCameraOfflineConfirmation: jest.Mock;
    cancelCameraOfflineConfirmation: jest.Mock;
  };
  aqvisionRecordingService: {
    reconcileCamera: jest.Mock;
    confirmCameraOffline: jest.Mock;
  };
}

function makeProcessor(): ProcessorMocks & {
  processor: LivestreamHealthProcessor;
} {
  const mocks: ProcessorMocks = {
    liveSessionRepository: {
      listActiveLiveSessions: jest.fn().mockResolvedValue([]),
    },
    liveSessionService: {
      checkSessionHealth: jest.fn().mockResolvedValue(undefined),
    },
    livestreamRepository: {
      listCameraRecordingTargets: jest.fn().mockResolvedValue([]),
      findCameraRecordingTarget: jest.fn(),
    },
    livestreamHealthQueue: {
      // Mô phỏng lấy được khóa: chạy operation ngay trong lời gọi.
      runWithCameraLock: jest.fn(
        async (
          _cameraId: string,
          operation: (lease: CameraLeaseHandle) => Promise<unknown>,
        ) =>
          operation({ cameraId: _cameraId, isOwned: () => true }),
      ),
      scheduleCameraOfflineConfirmation: jest
        .fn()
        .mockResolvedValue(undefined),
      cancelCameraOfflineConfirmation: jest
        .fn()
        .mockResolvedValue(undefined),
    },
    aqvisionRecordingService: {
      reconcileCamera: jest.fn().mockResolvedValue('RECORDING'),
      confirmCameraOffline: jest.fn().mockResolvedValue('STOPPED'),
    },
  };
  const ProcessorCtor = LivestreamHealthProcessor as unknown as new (
    liveSessionRepository: LiveSessionRepository,
    liveSessionService: LiveSessionService,
    livestreamRepository: LivestreamRepository,
    livestreamHealthQueue: LivestreamHealthQueue,
    aqvisionRecordingService: AqvisionRecordingService,
  ) => LivestreamHealthProcessor;
  const processor = new ProcessorCtor(
    mocks.liveSessionRepository as unknown as LiveSessionRepository,
    mocks.liveSessionService as unknown as LiveSessionService,
    mocks.livestreamRepository as unknown as LivestreamRepository,
    mocks.livestreamHealthQueue as unknown as LivestreamHealthQueue,
    mocks.aqvisionRecordingService as unknown as AqvisionRecordingService,
  );
  return { ...mocks, processor };
}

function sweepJob(): Job<LivestreamHealthJobData> {
  return { data: { kind: 'sweep' } } as unknown as Job<LivestreamHealthJobData>;
}

function confirmationJob(cameraId: string): Job<LivestreamHealthJobData> {
  return {
    data: { kind: 'confirm-camera-offline', cameraId },
  } as unknown as Job<LivestreamHealthJobData>;
}

function target(cameraId: string, hasLiveAssignment: boolean) {
  return { cameraId, streamName: `stream-${cameraId}`, hasLiveAssignment };
}

describe('LivestreamHealthProcessor — sweep', () => {
  it('sweep: reconcile moi camera target dung mot lan duoi khoa camera', async () => {
    const {
      processor,
      livestreamRepository,
      livestreamHealthQueue,
      aqvisionRecordingService,
    } = makeProcessor();
    // Repository gom theo camera: một dòng target = một camera,
    // kể cả camera chia sẻ nhiều assignment (hasLiveAssignment đã
    // được aggregate).
    livestreamRepository.listCameraRecordingTargets.mockResolvedValue([
      target('camera-1', true),
      target('camera-2', false),
    ]);

    await processor.process(sweepJob());

    expect(livestreamRepository.listCameraRecordingTargets).toHaveBeenCalledTimes(
      1,
    );
    expect(livestreamHealthQueue.runWithCameraLock).toHaveBeenCalledTimes(2);
    expect(livestreamHealthQueue.runWithCameraLock).toHaveBeenCalledWith(
      'camera-1',
      expect.any(Function),
    );
    expect(livestreamHealthQueue.runWithCameraLock).toHaveBeenCalledWith(
      'camera-2',
      expect.any(Function),
    );
    expect(aqvisionRecordingService.reconcileCamera).toHaveBeenCalledTimes(2);
    expect(
      aqvisionRecordingService.reconcileCamera.mock.calls.map(
        ([cameraId]) => cameraId,
      ),
    ).toEqual(['camera-1', 'camera-2']);
  });

  it('sweep: giu nguyen kiem tra suc khoe live session hien co', async () => {
    const {
      processor,
      liveSessionRepository,
      liveSessionService,
      livestreamRepository,
    } = makeProcessor();
    liveSessionRepository.listActiveLiveSessions.mockResolvedValue([
      { id: 'session-1' },
      { id: 'session-2' },
    ]);
    livestreamRepository.listCameraRecordingTargets.mockResolvedValue([
      target('camera-1', true),
    ]);

    await processor.process(sweepJob());

    expect(liveSessionRepository.listActiveLiveSessions).toHaveBeenCalledTimes(1);
    expect(liveSessionService.checkSessionHealth).toHaveBeenCalledTimes(2);
    expect(liveSessionService.checkSessionHealth).toHaveBeenCalledWith(
      'session-1',
    );
    expect(liveSessionService.checkSessionHealth).toHaveBeenCalledWith(
      'session-2',
    );
  });

  it('sweep: reconcile camera loi provider => job khong that bai, camera sau duoc sweep tiep', async () => {
    const {
      processor,
      livestreamRepository,
      aqvisionRecordingService,
    } = makeProcessor();
    livestreamRepository.listCameraRecordingTargets.mockResolvedValue([
      target('camera-1', true),
      target('camera-2', true),
    ]);
    aqvisionRecordingService.reconcileCamera.mockRejectedValue(
      new Error('provider error'),
    );

    await expect(processor.process(sweepJob())).resolves.toBeUndefined();

    // Lỗi camera-1 không được ngăn camera-2 reconcile cùng sweep.
    expect(aqvisionRecordingService.reconcileCamera).toHaveBeenCalledTimes(2);
  });

  it('sweep: tranh chap khoa (runWithCameraLock tra null) => bo qua camera, job khong that bai', async () => {
    const {
      processor,
      livestreamRepository,
      livestreamHealthQueue,
      aqvisionRecordingService,
    } = makeProcessor();
    livestreamRepository.listCameraRecordingTargets.mockResolvedValue([
      target('camera-1', true),
    ]);
    livestreamHealthQueue.runWithCameraLock.mockResolvedValue(null);

    await expect(processor.process(sweepJob())).resolves.toBeUndefined();

    // Operation không bao giờ chạy khi mất khóa.
    expect(aqvisionRecordingService.reconcileCamera).not.toHaveBeenCalled();
  });
});

describe('LivestreamHealthProcessor — confirm-camera-offline', () => {
  it('job xac nhan offline: dispatch confirmCameraOffline duoi khoa camera cua cameraId trong payload', async () => {
    const {
      processor,
      livestreamHealthQueue,
      aqvisionRecordingService,
    } = makeProcessor();

    await processor.process(confirmationJob('camera-7'));

    expect(livestreamHealthQueue.runWithCameraLock).toHaveBeenCalledTimes(1);
    expect(livestreamHealthQueue.runWithCameraLock).toHaveBeenCalledWith(
      'camera-7',
      expect.any(Function),
    );
    expect(aqvisionRecordingService.confirmCameraOffline).toHaveBeenCalledTimes(
      1,
    );
    expect(aqvisionRecordingService.confirmCameraOffline.mock.calls[0][0]).toBe(
      'camera-7',
    );
  });

  it('job xac nhan offline loi provider => job khong that bai (sẽ được sweep tao lại)', async () => {
    const { processor, aqvisionRecordingService } = makeProcessor();
    aqvisionRecordingService.confirmCameraOffline.mockRejectedValue(
      new Error('provider error'),
    );

    await expect(processor.process(confirmationJob('camera-7'))).resolves.toBeUndefined();
  });

  it('kind khong xac dinh => khong lam gi, khong nem', async () => {
    const { processor, aqvisionRecordingService } = makeProcessor();

    await expect(
      processor.process({
        data: { kind: 'unknown' },
      } as unknown as Job<LivestreamHealthJobData>),
    ).resolves.toBeUndefined();

    expect(aqvisionRecordingService.reconcileCamera).not.toHaveBeenCalled();
    expect(aqvisionRecordingService.confirmCameraOffline).not.toHaveBeenCalled();
  });
});
