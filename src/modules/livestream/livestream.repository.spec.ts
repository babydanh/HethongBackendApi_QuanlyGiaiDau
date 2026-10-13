import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../../database/schema';
import { LivestreamRepository } from './livestream.repository';

describe('LivestreamRepository camera recording targets', () => {
  it('keeps soft-deleted targets available for stop reconciliation', async () => {
    const rows = [
      {
        cameraId: 'camera-1',
        streamName: 'stream-1',
        hasLiveAssignment: false,
      },
    ];
    const query = {
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockResolvedValue(rows),
    };
    let projection: Record<string, unknown> | undefined;
    const db = {
      select: jest.fn((selected: Record<string, unknown>) => {
        projection = selected;
        return query;
      }),
    };
    const repository = new LivestreamRepository(db as never);

    await expect(repository.listCameraRecordingTargets()).resolves.toEqual(rows);

    if (!projection) throw new Error('Expected a camera recording projection');
    const dialect = new PgDialect();
    const cameraJoin = query.innerJoin.mock.calls.find(
      ([table]) => table === schema.livestreamCameras,
    );
    const matchJoin = query.innerJoin.mock.calls.find(
      ([table]) => table === schema.matches,
    );
    const tournamentJoin = query.innerJoin.mock.calls.find(
      ([table]) => table === schema.tournaments,
    );
    if (!cameraJoin || !matchJoin || !tournamentJoin) {
      throw new Error('Expected camera, match, and tournament recording joins');
    }

    expect(dialect.sqlToQuery(cameraJoin[1] as SQL).sql).not.toMatch(
      /deleted_at/i,
    );
    expect(dialect.sqlToQuery(matchJoin[1] as SQL).sql).not.toMatch(
      /deleted_at/i,
    );
    expect(dialect.sqlToQuery(tournamentJoin[1] as SQL).sql).not.toMatch(
      /deleted_at|archived_at/i,
    );

    const liveAssignmentSql = dialect.sqlToQuery(
      projection.hasLiveAssignment as SQL,
    ).sql;
    expect(liveAssignmentSql).toMatch(/bool_or\s*\(/i);
    expect(liveAssignmentSql).toContain('"stream_status" = \'LIVE\'');
    expect(
      liveAssignmentSql.match(/"deleted_at"\s+is\s+null/gi) ?? [],
    ).toHaveLength(3);
    expect(
      liveAssignmentSql.match(/"archived_at"\s+is\s+null/gi) ?? [],
    ).toHaveLength(1);
  });
});

describe('LivestreamRepository stream-name uniqueness', () => {
  it('checks archived cameras because the database unique index is global', async () => {
    const query = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([{ id: 'archived-camera' }]),
    };
    const repository = new LivestreamRepository({
      select: jest.fn().mockReturnValue(query),
    } as never);

    await expect(
      repository.isCameraStreamNameTaken('camera_new', 'camera-current'),
    ).resolves.toBe(true);

    const predicate = new PgDialect().sqlToQuery(query.where.mock.calls[0][0] as SQL);
    expect(predicate.sql).toContain('"stream_name" = $1');
    expect(predicate.sql).toContain('"id" <> $2');
    expect(predicate.sql).not.toMatch(/deleted_at/i);
    expect(predicate.params).toEqual(['camera_new', 'camera-current']);
  });
});

describe('LivestreamRepository camera-guarded stream updates', () => {
  it('conditions a LIVE transition on the expected camera assignment', async () => {
    const query = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue([]),
    };
    const repository = new LivestreamRepository({
      update: jest.fn().mockReturnValue(query),
    } as never);

    await Reflect.apply(repository.updateStreamStatus, repository, [
      'match-1',
      'LIVE',
      'user-1',
      'https://media.example.test/live.m3u8',
      'camera-1',
    ]);

    const predicate = new PgDialect().sqlToQuery(
      query.where.mock.calls[0][0] as SQL,
    );
    expect(predicate.sql).toContain('"match_id" = $1');
    expect(predicate.sql).toContain('"camera_id" = $2');
    expect(predicate.params).toEqual(['match-1', 'camera-1']);
  });
});

describe('LivestreamRepository.moveIdleMatchCamera', () => {
  function build(returned: unknown[]) {
    const query = {
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockResolvedValue(returned),
    };
    const repository = new LivestreamRepository({
      update: jest.fn().mockReturnValue(query),
    } as never);
    const sync = jest
      .spyOn(
        repository as unknown as { syncCameraStatus: (id: string) => Promise<void> },
        'syncCameraStatus',
      )
      .mockResolvedValue(undefined);
    return { repository, query, sync };
  }

  it('writes only while the match is still IDLE on the camera it is leaving', async () => {
    const { repository, query } = build([{ matchId: 'match-1' }]);

    await repository.moveIdleMatchCamera('match-1', 'camera-1', 'camera-2', 'https://p/h.m3u8');

    const predicate = new PgDialect().sqlToQuery(query.where.mock.calls[0][0] as SQL);
    expect(predicate.sql).toContain('"match_id" = $1');
    expect(predicate.sql).toContain('"camera_id" = $2');
    expect(predicate.sql).toContain('"stream_status" = $3');
    expect(predicate.params).toEqual(['match-1', 'camera-1', 'IDLE']);
    // Only the link changes: nothing resets startedAt/endedAt of a row.
    expect(query.set.mock.calls[0][0]).not.toHaveProperty('startedAt');
    expect(query.set.mock.calls[0][0]).not.toHaveProperty('endedAt');
  });

  it('reports false and syncs nothing when the match is no longer IDLE on that camera', async () => {
    const { repository, sync } = build([]);

    await expect(
      repository.moveIdleMatchCamera('match-1', 'camera-1', null, null),
    ).resolves.toBe(false);
    expect(sync).not.toHaveBeenCalled();
  });

  it('syncs the camera it left and the one it joined after a successful move', async () => {
    const { repository, sync } = build([{ matchId: 'match-1' }]);

    await expect(
      repository.moveIdleMatchCamera('match-1', 'camera-1', 'camera-2', 'https://p/h.m3u8'),
    ).resolves.toBe(true);
    expect(sync).toHaveBeenCalledWith('camera-1');
    expect(sync).toHaveBeenCalledWith('camera-2');
  });
});
