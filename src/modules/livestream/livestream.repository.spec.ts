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
