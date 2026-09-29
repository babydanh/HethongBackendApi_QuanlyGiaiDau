import { RegionsRepository } from './regions.repository';
import type { AppDb } from '../../database/db.types';

/**
 * Điểm ở giữa Phường Ô Chợ Dừa (Hà Nội). Chọn đúng điểm này vì nó nằm sát
 * ranh giới: theo ST_Covers nó thuộc Ô Chợ Dừa, còn tâm gần nhất là Văn Miếu
 * - Quốc Tử Giám chỉ cách ~990 m — nên hai nhánh cho hai đáp án khác nhau và
 * test bắt được nhầm lẫn nếu cờ bị bỏ sót.
 */
const HA_NOI_BORDER_POINT = { lat: 21.0278, lng: 105.8342 } as const;

const O_CHO_DUA = {
  wardCode: '190',
  wardName: 'Phường Ô Chợ Dừa',
  provinceCode: '1',
  provinceName: 'Thành phố Hà Nội',
};

/** Chỉ giữ phần db mà `resolveByPoint`/`findCentroid` thật sự dùng. */
function repositoryWith(rows: unknown[]): RegionsRepository {
  const db = { execute: jest.fn().mockResolvedValue(rows) };
  return new RegionsRepository(db as unknown as AppDb);
}

describe('RegionsRepository.resolveByPoint', () => {
  it('marks a polygon match as confirmed, not estimated', async () => {
    const repository = repositoryWith([O_CHO_DUA]);

    const resolved = await repository.resolveByPoint(HA_NOI_BORDER_POINT);

    expect(resolved).toEqual({
      ...O_CHO_DUA,
      centerLat: expect.any(Number),
      centerLng: expect.any(Number),
      isEstimated: false,
    });
  });

  it('marks a nearest-centroid match as estimated, because it is only a guess', async () => {
    // Không phường nào có polygon phủ điểm — đúng tình huống production, nơi
    // cột `wards.boundary` trống toàn bộ.
    const repository = repositoryWith([]);

    const resolved = await repository.resolveByPoint(HA_NOI_BORDER_POINT);

    // Tâm gần nhất là Văn Miếu - Quốc Tử Giám, KHÁC phường chứa điểm: bằng
    // chứng cho thấy đáp án này là phỏng đoán theo khoảng cách, và nó phải
    // tự nói ra trước khi ai đó điền vào form.
    expect(resolved?.wardCode).toBe('226');
    expect(resolved?.wardName).toBe('Phường Văn Miếu - Quốc Tử Giám');
    expect(resolved?.isEstimated).toBe(true);
  });

  it('returns null beyond the nearest-centroid cap instead of guessing', async () => {
    const repository = repositoryWith([]);

    // Giữa Thái Bình Dương: vượt trần 75 km nên không gán phường Việt Nam nào.
    const resolved = await repository.resolveByPoint({ lat: 0, lng: -160 });

    expect(resolved).toBeNull();
  });
});

describe('RegionsRepository.findCentroid', () => {
  it('flags the ward centroid as an estimate of where to drop the pin', async () => {
    const repository = repositoryWith([]);

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
