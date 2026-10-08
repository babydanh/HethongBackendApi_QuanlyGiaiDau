import type { Queue } from 'bullmq';
import type { RedisService } from '../../providers/redis/redis.service';
import { LivestreamHealthQueue, type CameraLeaseHandle } from './livestream-health.queue';
import type { LivestreamHealthJobData } from './livestream-health.processor';

/** Lease theo camera: TTL 30s, gia hạn mỗi 10s (theo đặc tả Task 2). */
const LOCK_TTL_MS = 30_000;
const LOCK_RENEW_MS = 10_000;
/** Grace period xác nhận offline: 60s. */
const CONFIRMATION_DELAY_MS = 60_000;
const CONFIRMATION_JOB_ID_PREFIX = 'livestream-camera-offline-confirmation-';

function cameraLockKey(cameraId: string): string {
  return `livestream:camera-lock:${cameraId}`;
}

function offlineConfirmationJobId(cameraId: string): string {
  return `${CONFIRMATION_JOB_ID_PREFIX}${cameraId}`;
}

/**
 * Redis client mock mô phỏng ngữ nghĩa lease: `SET ... NX` chỉ thành
 * công khi khoá trống, `eval` so token để gia hạn (pexpire) hoặc xoá
 * (del) — giống Lua compare-and-delete của RedisService.
 */
interface RedisClientMock {
  set: jest.Mock;
  eval: jest.Mock;
}

function makeRedisClient(): {
  client: RedisClientMock;
  store: Map<string, { value: string; expiresAt: number }>;
} {
  const store = new Map<string, { value: string; expiresAt: number }>();
  const client = {
    set: jest.fn((key: string, value: string, ...rest: unknown[]) => {
      const pxIndex = rest.indexOf('PX');
      const ttl = pxIndex >= 0 ? Number(rest[pxIndex + 1]) : 0;
      const existing = store.get(key);
      if (existing && existing.expiresAt > Date.now()) {
        // NX: khoá đang có chủ.
        return Promise.resolve(null);
      }
      store.set(key, {
        value,
        expiresAt: ttl > 0 ? Date.now() + ttl : Number.POSITIVE_INFINITY,
      });
      return Promise.resolve('OK');
    }),
    eval: jest.fn(
      (
        script: string,
        _numKeys: number,
        key: string,
        token: string,
        ...rest: unknown[]
      ) => {
        const entry = store.get(key);
        if (!entry || entry.value !== token) {
          // Token không khớp: lease đã hết hạn hoặc bị chủ khác lấy.
          return Promise.resolve(0);
        }
        if (script.includes('pexpire')) {
          entry.expiresAt = Date.now() + Number(rest[0]);
          return Promise.resolve(1);
        }
        if (script.includes('del')) {
          store.delete(key);
          return Promise.resolve(1);
        }
        return Promise.resolve(0);
      },
    ),
  };
  return { client, store };
}



function makeQueue(client: RedisClientMock): LivestreamHealthQueue {
  const redisService = {
    getClient: () => client,
  } as unknown as RedisService;
  const QueueCtor = LivestreamHealthQueue as unknown as new (
    queue: Queue<LivestreamHealthJobData>,
    redisService: RedisService,
  ) => LivestreamHealthQueue;
  return new QueueCtor(
    {} as unknown as Queue<LivestreamHealthJobData>,
    redisService,
  );
}

describe('LivestreamHealthQueue — camera lock', () => {
  it('lay lease voi SET NX PX 30_000 va release bang compare-and-delete sau operation', async () => {
    const { client } = makeRedisClient();
    const queue = makeQueue(client);

    const result = await queue.runWithCameraLock('camera-1', async () => 'done');

    expect(result).toBe('done');
    expect(client.set).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledWith(
      cameraLockKey('camera-1'),
      expect.any(String),
      'PX',
      LOCK_TTL_MS,
      'NX',
    );

    // Release phải dùng cùng token đã lấy lease (compare-and-delete).
    const token = client.set.mock.calls[0][1];
    const releaseCalls = client.eval.mock.calls.filter(([script]) =>
      String(script).includes('del'),
    );
    expect(releaseCalls).toHaveLength(1);
    expect(releaseCalls[0]).toEqual([
      expect.stringContaining('del'),
      1,
      cameraLockKey('camera-1'),
      token,
    ]);
  });

  it('hai operation cung camera: nguoi thu hai tra null, side effect chi chay mot lan', async () => {
    const { client } = makeRedisClient();
    const queue = makeQueue(client);
    const sideEffects: string[] = [];
    const operation = async () => {
      sideEffects.push('begin');
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      sideEffects.push('end');
      return 'first';
    };

    const [first, second] = await Promise.all([
      queue.runWithCameraLock('camera-1', operation),
      queue.runWithCameraLock('camera-1', operation),
    ]);

    expect(first).toBe('first');
    expect(second).toBeNull();
    // Khoá theo camera tuần tự hoá side effect: operation chỉ chạy đúng 1 lần.
    expect(sideEffects).toEqual(['begin', 'end']);
  });

  it('hai operation khac camera: chay dong thoi (khoá theo camera, không toàn cục)', async () => {
    const { client } = makeRedisClient();
    const queue = makeQueue(client);
    const order: string[] = [];
    const operation =
      (name: string) =>
      async (): Promise<string> => {
        order.push(`${name}-begin`);
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
        order.push(`${name}-end`);
        return name;
      };

    const [first, second] = await Promise.all([
      queue.runWithCameraLock('camera-1', operation('one')),
      queue.runWithCameraLock('camera-2', operation('two')),
    ]);

    expect(first).toBe('one');
    expect(second).toBe('two');
    expect(order).toEqual(['one-begin', 'two-begin', 'one-end', 'two-end']);
  });

  it('gia han lease moi 10_000 ms bang token-checked PEXPIRE voi TTL 30_000', async () => {
    jest.useFakeTimers();
    try {
      const { client } = makeRedisClient();
      const queue = makeQueue(client);
      const operation = () =>
        new Promise<string>((resolve) => {
          setTimeout(resolve, 35_000, 'slow');
        });

      const pending = queue.runWithCameraLock('camera-1', operation);

      await jest.advanceTimersByTimeAsync(LOCK_RENEW_MS);

      const token = client.set.mock.calls[0][1];
      expect(client.eval).toHaveBeenCalledWith(
        expect.stringContaining('pexpire'),
        1,
        cameraLockKey('camera-1'),
        token,
        LOCK_TTL_MS,
      );

      await jest.advanceTimersByTimeAsync(LOCK_TTL_MS);
      expect(await pending).toBe('slow');
    } finally {
      jest.useRealTimers();
    }
  });

  it('mat lease (gia han tra 0) => tra null, handle cua no bao unowned', async () => {
    jest.useFakeTimers();
    try {
      const { client } = makeRedisClient();
      // Mô phỏng lease bị chủ khác lấy sau khi hết hạn: gia hạn không còn hiệu lực.
      client.eval.mockImplementation(
        (script: string, _numKeys: number, _key: string, _token: string) =>
          Promise.resolve(String(script).includes('pexpire') ? 0 : 1),
      );
      const queue = makeQueue(client);
      let lease: CameraLeaseHandle | undefined;
      const operation = (cameraLease?: CameraLeaseHandle) => {
        lease = cameraLease;
        return new Promise<string>((resolve) => {
          setTimeout(resolve, 60_000, 'stale');
        });
      };

      const pending = queue.runWithCameraLock('camera-1', operation);

      await jest.advanceTimersByTimeAsync(LOCK_RENEW_MS);

      expect(await pending).toBeNull();
      expect(lease?.isOwned()).toBe(false);

      // Không còn là chủ lease: tuyệt đối không release (xoá lease của người khác).
      const releaseCalls = client.eval.mock.calls.filter(([script]) =>
        String(script).includes('del'),
      );
      expect(releaseCalls).toHaveLength(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('lease cu khong the thay lease moi cung camera la cua minh', async () => {
    jest.useFakeTimers();
    try {
      const { client, store } = makeRedisClient();
      client.eval.mockImplementation(
        (script: string) =>
          Promise.resolve(String(script).includes('pexpire') ? 0 : 1),
      );
      const queue = makeQueue(client);
      let releaseStaleOperation = (): void => {};
      let markStaleStarted = (): void => {};
      const staleStarted = new Promise<void>((resolve) => {
        markStaleStarted = resolve;
      });
      let finishStaleOperation = (): void => {};
      const staleFinished = new Promise<void>((resolve) => {
        finishStaleOperation = resolve;
      });
      let staleLeaseOwned: boolean | undefined;

      const staleRun = queue.runWithCameraLock(
        'camera-1',
        async (lease?: CameraLeaseHandle) => {
          markStaleStarted();
          await new Promise<void>((resolve) => {
            releaseStaleOperation = resolve;
          });
          staleLeaseOwned = lease?.isOwned();
          finishStaleOperation();
          return 'stale';
        },
      );

      await staleStarted;
      await jest.advanceTimersByTimeAsync(LOCK_RENEW_MS);
      await expect(staleRun).resolves.toBeNull();

      store.delete(cameraLockKey('camera-1'));
      let releaseCurrentOperation = (): void => {};
      let markCurrentStarted = (): void => {};
      const currentStarted = new Promise<void>((resolve) => {
        markCurrentStarted = resolve;
      });
      const currentRun = queue.runWithCameraLock('camera-1', async () => {
        markCurrentStarted();
        await new Promise<void>((resolve) => {
          releaseCurrentOperation = resolve;
        });
        return 'current';
      });

      await currentStarted;
      releaseStaleOperation();
      await staleFinished;
      expect(staleLeaseOwned).toBe(false);

      releaseCurrentOperation();
      await expect(currentRun).resolves.toBe('current');
    } finally {
      jest.useRealTimers();
    }
  });

  it('loi Redis khi gia han => tra null (không the xac minh quyen so huu)', async () => {
    jest.useFakeTimers();
    try {
      const { client } = makeRedisClient();
      client.eval.mockRejectedValue(new Error('redis unavailable'));
      const queue = makeQueue(client);
      const operation = () =>
        new Promise<string>((resolve) => {
          setTimeout(resolve, 60_000, 'stale');
        });

      const pending = queue.runWithCameraLock('camera-1', operation);

      await jest.advanceTimersByTimeAsync(LOCK_RENEW_MS);

      expect(await pending).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('lease handle reports true while its operation runs, false after release', async () => {
    const { client } = makeRedisClient();
    const queue = makeQueue(client);
    let ownedDuringOperation: boolean | undefined;
    let lease: CameraLeaseHandle | undefined;
    const operation = async (cameraLease?: CameraLeaseHandle) => {
      lease = cameraLease;
      ownedDuringOperation = cameraLease?.isOwned();
      return 'ok';
    };

    const result = await queue.runWithCameraLock('camera-1', operation);

    expect(result).toBe('ok');
    expect(ownedDuringOperation).toBe(true);
    expect(lease?.isOwned()).toBe(false);
  });

  it('operation nem => lease van duoc release, loi nem qua cho caller', async () => {
    const { client } = makeRedisClient();
    const queue = makeQueue(client);
    const failure = new Error('operation failed');

    await expect(
      queue.runWithCameraLock('camera-1', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    const token = client.set.mock.calls[0][1];
    const releaseCalls = client.eval.mock.calls.filter(([script]) =>
      String(script).includes('del'),
    );
    expect(releaseCalls).toHaveLength(1);
    expect(releaseCalls[0]).toEqual([
      expect.stringContaining('del'),
      1,
      cameraLockKey('camera-1'),
      token,
    ]);
  });
});

describe('LivestreamHealthQueue — offline confirmation jobs', () => {
  it('scheduleCameraOfflineConfirmation: them job delay 60_000 voi jobId on dinh theo camera', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const QueueCtor = LivestreamHealthQueue as unknown as new (
      queue: Queue<LivestreamHealthJobData>,
      redisService: RedisService,
    ) => LivestreamHealthQueue;
    const queue = new QueueCtor(
      { add } as unknown as Queue<LivestreamHealthJobData>,
      {} as unknown as RedisService,
    );

    await queue.scheduleCameraOfflineConfirmation('camera-9');

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'confirm-camera-offline',
      { kind: 'confirm-camera-offline', cameraId: 'camera-9' },
      expect.objectContaining({
        delay: CONFIRMATION_DELAY_MS,
        jobId: offlineConfirmationJobId('camera-9'),
      }),
    );
  });

  it('jobId on dinh: sweep lap lai cung camera => cung jobId (khong tao job trung)', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const QueueCtor = LivestreamHealthQueue as unknown as new (
      queue: Queue<LivestreamHealthJobData>,
      redisService: RedisService,
    ) => LivestreamHealthQueue;
    const queue = new QueueCtor(
      { add } as unknown as Queue<LivestreamHealthJobData>,
      {} as unknown as RedisService,
    );

    await queue.scheduleCameraOfflineConfirmation('camera-9');
    await queue.scheduleCameraOfflineConfirmation('camera-9');

    expect(add).toHaveBeenCalledTimes(2);
    const jobIds = add.mock.calls.map((call) => call[2].jobId as string);
    expect(jobIds).toEqual([
      offlineConfirmationJobId('camera-9'),
      offlineConfirmationJobId('camera-9'),
    ]);
  });

  it('jobId tuân BullMQ: khong chua ":", on dinh theo camera va khac nhau giua hai camera', async () => {
    const add = jest.fn().mockResolvedValue(undefined);
    const QueueCtor = LivestreamHealthQueue as unknown as new (
      queue: Queue<LivestreamHealthJobData>,
      redisService: RedisService,
    ) => LivestreamHealthQueue;
    const queue = new QueueCtor(
      { add } as unknown as Queue<LivestreamHealthJobData>,
      {} as unknown as RedisService,
    );

    await queue.scheduleCameraOfflineConfirmation('camera-9');
    await queue.scheduleCameraOfflineConfirmation('camera-10');

    expect(add).toHaveBeenCalledTimes(2);
    const jobIds = add.mock.calls.map((call) => call[2].jobId as string);
    // BullMQ 5.79 ném 'Custom Id cannot contain :' khi jobId
    // có ':' mà không đúng định dạng repeatable (split(':').length === 3).
    for (const jobId of jobIds) {
      expect(jobId).not.toContain(':');
    }
    // Ổn định: cùng cameraId → cùng jobId.
    expect(jobIds[0]).toBe(offlineConfirmationJobId('camera-9'));
    // Khác cameraId → khác jobId.
    expect(jobIds[1]).toBe(offlineConfirmationJobId('camera-10'));
    expect(jobIds[0]).not.toBe(jobIds[1]);
  });

  it('cancelCameraOfflineConfirmation: xoa job theo jobId on dinh', async () => {
    const remove = jest.fn().mockResolvedValue(1);
    const QueueCtor = LivestreamHealthQueue as unknown as new (
      queue: Queue<LivestreamHealthJobData>,
      redisService: RedisService,
    ) => LivestreamHealthQueue;
    const queue = new QueueCtor(
      { remove } as unknown as Queue<LivestreamHealthJobData>,
      {} as unknown as RedisService,
    );

    await queue.cancelCameraOfflineConfirmation('camera-9');

    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(offlineConfirmationJobId('camera-9'));
  });
});
