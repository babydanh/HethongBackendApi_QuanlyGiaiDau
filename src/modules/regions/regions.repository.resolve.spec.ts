import { RegionsRepository } from './regions.repository';
import type { AppDb } from '../../database/db.types';

/**
 * Điểm bên trong Phường Ô Chợ Dừa (Hà Nội), dùng để kiểm tra polygon match.
 */
const HA_NOI_BORDER_POINT = { lat: 21.0278, lng: 105.8342 } as const;

const O_CHO_DUA = {
  wardCode: '190',
  wardName: 'Phường Ô Chợ Dừa',
  provinceCode: '1',
  provinceName: 'Thành phố Hà Nội',
};

/** Chỉ giữ phần db mà `resolveByPoint`/`findCentroid` thật sự dùng. */
function repositoryWith(rows: unknown[], centroidRows = rows): RegionsRepository {
  const query = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    limit: jest.fn().mockResolvedValue(centroidRows),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  const db = {
    execute: jest.fn().mockResolvedValue(rows),
    select: jest.fn().mockReturnValue(query),
  };
  return new RegionsRepository(db as unknown as AppDb);
}

describe('RegionsRepository.resolveByPoint', () => {
  it('marks a polygon match as confirmed, not estimated', async () => {
    const repository = repositoryWith([{
      ...O_CHO_DUA,
      centerLat: 21.0278,
      centerLng: 105.8342,
    }]);

    const resolved = await repository.resolveByPoint(HA_NOI_BORDER_POINT);

    expect(resolved).toEqual({
      ...O_CHO_DUA,
      centerLat: expect.any(Number),
      centerLng: expect.any(Number),
      isEstimated: false,
    });
  });

  it('returns null when no stored boundary covers the point', async () => {
    // Không phường nào có polygon phủ điểm — đúng tình huống production, nơi
    // cột `wards.boundary` trống toàn bộ.
    const repository = repositoryWith([]);

    const resolved = await repository.resolveByPoint(HA_NOI_BORDER_POINT);

    expect(resolved).toBeNull();
  });

  it('returns null when the point is outside every stored polygon', async () => {
    const repository = repositoryWith([]);

    // Giữa Thái Bình Dương: không có polygon bao phủ điểm.
    const resolved = await repository.resolveByPoint({ lat: 0, lng: -160 });

    expect(resolved).toBeNull();
  });
});

describe('RegionsRepository.findCentroid', () => {
  it('flags the ward centroid as an estimate of where to drop the pin', async () => {
    const repository = repositoryWith([], [{
      ...O_CHO_DUA,
      centerLat: 21.0278,
      centerLng: 105.8342,
    }]);

    const resolved = await repository.findCentroid({
      provinceCode: O_CHO_DUA.provinceCode,
      wardCode: O_CHO_DUA.wardCode,
    });

    expect(resolved).toEqual({
      ...O_CHO_DUA,
      centerLat: expect.any(Number),
      centerLng: expect.any(Number),
      isEstimated: true,
    });
  });
});
