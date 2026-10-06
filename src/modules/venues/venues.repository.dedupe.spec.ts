import { VenuesRepository } from './venues.repository';
import type { AppDb } from '../../database/db.types';

type QueryBuilder = {
  from: (...args: unknown[]) => QueryBuilder;
  where: (...args: unknown[]) => QueryBuilder;
  orderBy: (...args: unknown[]) => QueryBuilder;
  limit: (...args: unknown[]) => QueryBuilder;
  then: (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

type InsertBuilder = {
  values: (...args: unknown[]) => InsertBuilder;
  returning: (...args: unknown[]) => Promise<unknown[]>;
};

/**
 * `findOrCreateForSocial` là đường dùng chung cho cả create và update:
 * host ghim đúng sân đã có trong thư viện thì phải tái dùng venue cũ, còn
 * ghim trùng bán kính mà tên lệch thì vẫn phải trả 409 để host chọn lại.
 */
describe('VenuesRepository.findOrCreateForSocial', () => {
  const data = {
    name: 'Sân Cầu Giấy',
    locationAddress: '30 Tân Thắng, P.15, Q.Tân Bình',
    latitude: 10.7769,
    longitude: 106.7009,
  };

  function makeRepository(selectResults: unknown[][], insertResult: unknown[] = []) {
    let selectCalls = 0;
    const insertValues: unknown[] = [];

    const tx = {
      execute: () => Promise.resolve([]),
      select: () => {
        const result = selectResults[selectCalls++] ?? [];
        const builder: QueryBuilder = {
          from: () => builder,
          where: () => builder,
          orderBy: () => builder,
          limit: () => builder,
          then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
        };
        return builder;
      },
      insert: () => {
        const builder: InsertBuilder = {
          values: (args) => {
            insertValues.push(args);
            return builder;
          },
          returning: () => Promise.resolve(insertResult),
        };
        return builder;
      },
    };

    const db = {
      transaction: () => {
        throw new Error('findOrCreateForSocial với executor riêng không được tự mở transaction');
      },
    };
    const auditService = { logCreate: () => Promise.resolve() };
    const repository = new VenuesRepository(
      db as unknown as AppDb,
      auditService as never,
    );

    return {
      repository,
      tx: tx as never,
      selectCalls: () => selectCalls,
      insertValues,
    };
  }

  it('tái dùng venue đã có khi tên khớp chuẩn hoá và trong bán kính, không insert', async () => {
    const existing = {
      id: 'venue-existing',
      name: 'sân cầu giấy',
      locationAddress: 'Địa chỉ cũ',
      latitude: 10.77695,
      longitude: 106.70095,
      distanceMeters: 8,
    };
    const harness = makeRepository([[existing]]);

    const result = await harness.repository.findOrCreateForSocial(
      'user-1',
      data,
      harness.tx,
      { provinceCode: 'HN', wardCode: 'HN001' },
    );

    expect(result).toEqual(existing);
    expect(harness.insertValues).toHaveLength(0);
    // Khớp tuyệt đối thì dừng luôn, không cần hỏi tiếp ứng viên mơ hồ.
    expect(harness.selectCalls()).toBe(1);
  });

  it('trả duplicateCandidates khi trùng bán kính nhưng tên không khớp tuyệt đối', async () => {
    const candidates = [
      {
        id: 'venue-a',
        name: 'Sân Cầu Giấy A',
        locationAddress: 'A',
        latitude: 10.77695,
        longitude: 106.70095,
        distanceMeters: 8,
      },
      {
        id: 'venue-b',
        name: 'Sân Cầu Giấy B',
        locationAddress: 'B',
        latitude: 10.77699,
        longitude: 106.70099,
        distanceMeters: 14,
      },
    ];
    // select 1: exact-match -> rỗng. select 2: fuzzy -> 2 ứng viên mơ hồ.
    const harness = makeRepository([[], candidates]);

    const result = await harness.repository.findOrCreateForSocial(
      'user-1',
      data,
      harness.tx,
      { provinceCode: 'HN', wardCode: 'HN001' },
    );

    expect(result).toEqual({ duplicateCandidates: candidates });
    expect(harness.insertValues).toHaveLength(0);
    expect(harness.selectCalls()).toBe(2);
  });

  it('insert venue mới khi không có ứng viên nào trùng vị trí', async () => {
    const created = {
      id: 'venue-new',
      name: 'Sân Mới',
      locationAddress: 'Địa chỉ mới',
      locationGeolocation: 'POINT(106.7009 10.7769)',
      provinceCode: 'HN',
      wardCode: 'HN001',
    };
    const harness = makeRepository([[], []], [created]);

    const result = await harness.repository.findOrCreateForSocial(
      'user-1',
      data,
      harness.tx,
      { provinceCode: 'HN', wardCode: 'HN001' },
    );

    expect(result).toEqual(created);
    expect(harness.insertValues).toHaveLength(1);
    expect(harness.insertValues[0]).toMatchObject({
      ownerUserId: 'user-1',
      name: data.name,
      locationAddress: data.locationAddress,
      provinceCode: 'HN',
      wardCode: 'HN001',
    });
  });

  it('khi có nhiều venue cùng tên trong bán kính thì không tự chọn, đi tiếp vào dedupe mơ hồ', async () => {
    const twinA = {
      id: 'venue-twin-a',
      name: 'Sân Cầu Giấy',
      locationAddress: 'A',
      latitude: 10.77695,
      longitude: 106.70095,
      distanceMeters: 8,
    };
    const twinB = {
      id: 'venue-twin-b',
      name: 'Sân Cầu Giấy',
      locationAddress: 'B',
      latitude: 10.77699,
      longitude: 106.70099,
      distanceMeters: 14,
    };
    // select 1: exact -> 2 dòng nên không dứt khoáng được, phải hỏi tiếp.
    const harness = makeRepository([[twinA, twinB], [twinA, twinB]]);

    const result = await harness.repository.findOrCreateForSocial(
      'user-1',
      data,
      harness.tx,
      { provinceCode: 'HN', wardCode: 'HN001' },
    );

    expect(result).toEqual({ duplicateCandidates: [twinA, twinB] });
    expect(harness.insertValues).toHaveLength(0);
  });

  it('venue không ghim toạ độ thì không chạy dedupe, insert thẳng', async () => {
    const created = { id: 'venue-unpinned', name: data.name, locationAddress: data.locationAddress };
    const harness = makeRepository([], [created]);

    const result = await harness.repository.findOrCreateForSocial('user-1', {
      name: data.name,
      locationAddress: data.locationAddress,
    }, harness.tx, { provinceCode: null, wardCode: null });

    expect(result).toEqual(created);
    expect(harness.selectCalls()).toBe(0);
    expect(harness.insertValues[0]).not.toHaveProperty('locationGeolocation');
  });
});
