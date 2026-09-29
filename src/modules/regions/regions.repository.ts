import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { and, asc, eq, ilike, or, SQL } from 'drizzle-orm';
import {
  QueryCentroidDto,
  QueryRegionDto,
  QueryResolveDto,
  QueryWardDto,
  ResolvedRegionDto,
} from './dto/query-region.dto';
import {
  findNearestWardCentroid,
  findWardCentroid,
} from './ward-centroids';

/**
 * Hình dạng trả về chỉ được định nghĩa một lần, ở `ResolvedRegionDto`, để
 * Swagger mô tả đúng thứ client nhận. Ở đây giữ lại tên cũ cho các chữ ký
 * bên dưới.
 *
 * Trường thêm vào sau là `isEstimated` — phân biệt "tìm thấy" với "đoán ra".
 * Cả hai nhánh của `resolveByPoint` từng trả cùng một hình dạng, nên client
 * không có cách nào biết mình đang nhìn phường nào. Điều đó nguy hiểm vì ghim
 * tự đặt nằm đúng ở tâm phường: tra ngược lại, nhánh tâm gần nhất khớp thẳng
 * về đúng phường đó (khoảng cách 0) — hệ thống "xác nhận" lại chính phỏng đoán
 * của nó, nhìn thì tự nhất quán một cách hoàn hảo mà không có căn cứ. Và ở khu
 * vực đông (phường HCM cách nhau ~500 m) một ghim sát ranh giới khớp sang phường
 * kế bên mà không có tín hiệu nào cho biết.
 */
export type ResolvedRegion = ResolvedRegionDto;

@Injectable()
export class RegionsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {}

  async findProvinces(query: QueryRegionDto) {
    let conditions: SQL | undefined = undefined;
    if (query.search) {
      conditions = or(
        ilike(schema.provinces.name, `%${query.search}%`),
        ilike(schema.provinces.fullName, `%${query.search}%`)
      );
    }
    return this.db
      .select()
      .from(schema.provinces)
      .where(conditions)
      .orderBy(asc(schema.provinces.fullName), asc(schema.provinces.name), asc(schema.provinces.code));
  }

  async findWards(query: QueryWardDto) {
    let conditions: SQL | undefined = undefined;
    const filters: SQL[] = [];

    if (query.provinceCode) {
      filters.push(eq(schema.wards.provinceCode, query.provinceCode));
    }
    
    if (query.search) {
      filters.push(
        or(
          ilike(schema.wards.name, `%${query.search}%`),
          ilike(schema.wards.fullName, `%${query.search}%`)
        ) as SQL
      );
    }
    
    conditions = filters.length > 1 ? and(...filters) : filters[0];

    return this.db
      .select()
      .from(schema.wards)
      .where(conditions)
      .orderBy(asc(schema.wards.fullName), asc(schema.wards.name), asc(schema.wards.code));
  }
  /**
   * Chiều ghim → địa chỉ: phường chứa điểm toạ độ.
   *
   * Hai nhánh, theo thứ tự ưu tiên độ chính xác:
   *
   * 1. `ST_Covers` với `wards.boundary` khi phường đó có polygon. Chính xác
   *    tuyệt đối, kể cả khi điểm nằm trên ranh giới (chứa-hằm). Đây là
   *    nhánh dùng được ở môi trường dev, và sẽ tự động đúng lại nếu ai đó
   *    chạy lại import ranh giới — không phải sửa code.
   *
   *    `::geography` là bắt buộc: `wards.boundary` là geography(MultiPolygon,
   *    4326) nên điểm tham chiếu cũng phải là geography. PostGIS 3.3 KHÔNG có
   *    overload ST_Contains(geography, geography): query viết bằng hàm đó hỏng
   *    lúc parse (42883) và mọi điểm — kể cả điểm ngoài mọi phường — đều trả
   *    500 thay vì null.
   *
   * 2. Khi không có polygon nào phủ điểm (production: cột `boundary` trống
   *    toàn bộ) thì rơi về tâm gần nhất trong `seed/ward-centroids.tsv`, có
   *    trần khoảng cách. Nhánh này SAI ở đường ranh giới: đo thật, điểm
   *    21.0278,105.8342 (Hà Nội) nằm trong Phường Ô Chợ Dừa theo ST_Covers,
   *    còn tâm gần nhất là Phường Văn Miếu - Quốc Tử Giám cách 980 m. Đây là
   *    đánh đổi đã chấp nhận: có polygon thì dùng polygon, không thì ưu tiên
   *    trả đúng một phường nào đó cho người dùng chọn tay được.
   *
   * Trả null khi điểm không khớp phường nào và cũng vượt trần 75 km — điểm ở
   * nước khác hay toạ độ rác không được gán bừa một phường Việt Nam.
   *
   * Hai nhánh đó trả về khác nhau đúng một trường: `isEstimated`. Nhánh 1
   * trả `false` (đã xác nhận bằng chứa-hằm), nhánh 2 trả `true` (chỉ là đo
   * khoảng cách tới tâm). Không có sự phân biệt này thì ghim tự đặt ở tâm
   * phường N được nhánh 2 khớp thẳng về lại phường N, và endpoint trông như
   * đang xác nhận kết quả trong khi thực ra chỉ đang lặp lại phỏng đoán của
   * chính nó.
   */
  async resolveByPoint(query: QueryResolveDto): Promise<ResolvedRegion | null> {
    const rows = await this.db.execute(sql`
      SELECT
        w.code AS "wardCode",
        w.name AS "wardName",
        p.code AS "provinceCode",
        p.name AS "provinceName"
      FROM wards w
      JOIN provinces p ON p.code = w.province_code
      WHERE ST_Covers(
        w.boundary,
        ST_SetSRID(ST_MakePoint(${query.lng}, ${query.lat}), 4326)::geography
      )
      LIMIT 1
    `);
    const covered = (rows as unknown as Omit<
      ResolvedRegion,
      'centerLat' | 'centerLng' | 'isEstimated'
    >[])[0];
    if (covered) {
      // Tâm lấy từ file chứ không từ `wards.center_lat`: production có cột này
      // toàn NULL, lấy từ đó thì endpoint vẫn trả centerLat: null. 16 phường
      // không có tâm trong file thì trả null cho tâm, vẫn giữ được tên phường.
      const centroid = findWardCentroid(
        covered.provinceCode,
        covered.wardCode,
      );
      return {
        ...covered,
        centerLat: centroid?.lat ?? null,
        centerLng: centroid?.lng ?? null,
        isEstimated: false,
      };
    }

    const nearest = findNearestWardCentroid(query.lat, query.lng);
    if (!nearest) return null;
    return {
      wardCode: nearest.wardCode,
      wardName: nearest.wardName,
      centerLat: nearest.lat,
      centerLng: nearest.lng,
      provinceCode: nearest.provinceCode,
      provinceName: nearest.provinceName,
      isEstimated: true,
    };
  }

  /**
   * Chiều địa chỉ → ghim: tâm hình học của phường đã biết.
   *
   * Không đụng DB: file TSV đã mang đủ tên phường, tên tỉnh và toạ độ tâm,
   * nên một tra cứu Map trả về trạng thái đầy đủ — không bao giờ nửa vời
   * (tên có, tâm null). Phường mới thêm sau lần sinh file thì chưa có tâm, và
   * trả null là câu trả lời trung thực: chưa biết đặt ghim ở đâu.
   *
   * Luôn trả `isEstimated: true`: tâm phường là vị trí đại diện, không phải
   * nơi thật của kèo. App vốn đã tự biết điều này — nó đặt ghim rồi gắn
   * nhãn "ghim tự động" kèm nút sửa — nhưng cờ vẫn phải đúng cho bất kỳ
   * client nào đọc chung kiểu với `resolveByPoint`.
   */
  async findCentroid(query: QueryCentroidDto): Promise<ResolvedRegion | null> {
    const ward = findWardCentroid(query.provinceCode, query.wardCode);
    if (!ward) return null;
    return {
      wardCode: ward.wardCode,
      wardName: ward.wardName,
      centerLat: ward.lat,
      centerLng: ward.lng,
      provinceCode: ward.provinceCode,
      provinceName: ward.provinceName,
      isEstimated: true,
    };
  }
}
