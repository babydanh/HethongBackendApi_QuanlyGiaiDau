import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tâm hình học của từng phường, nạp từ `seed/ward-centroids.tsv`.
 *
 * Vì sao đọc file thay vì đọc cột `wards.center_lat/l.center_lng`:
 * production chưa bao giờ có giá trị trong cột đó — commit 6558973 gỡ import
 * ranh giới khỏi `deploy.yml`, mà tâm chỉ được sinh ra cùng lúc nạp polygon.
 * Hai endpoint tra toạ độ vì thế trả null cho *mọi* điểm trên production mà
 * không báo lỗi. File TSV ~250 KB là nguồn duy nhất đã được commit nên đóng
 * gói cùng ảnh Docker, không phụ thuộc cây GeoJSON ~630 MB.
 *
 * Toạ độ trong file là `ST_PointOnSurface` nên nằm *bên trong* chính polygon
 * của phường đó; `ST_Centroid` của 33/3305 phường rơi ra ngoài (xa nhất 391 km
 * ngoài khơi) nên tuyệt đối không được thay bằng cách tính lại.
 */

/** Bán kính Trái Đất trung bình theo WGS-84, km. */
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Trần khoảng cách để coi một điểm là "còn nằm trong vùng có phường".
 *
 * Đặt số này từ số đo thật trên 3305 phường có polygon, chứ không đoán mò:
 *  - khoảng cách từ điểm bất kỳ trong phường tới tâm của chính phường đó:
 *    trung vị 8.6 km, p99 23.1 km;
 *  - điểm *ngoài* lãnh thổ gần nhất đo được: Trường Sa 135 km (lãnh thổ VN
 *    hợp pháp, không loại), rồi tới Vịnh Thái Lan 184 km, Biển Đông 231 km,
 *    Hải Phòng-Nam Định 210 km, Bắc Kinh 258 km, Bangkok 546 km.
 *
 * 75 km nằm giữa hai nhóm: vượt 3 lần p99 trong nước (không bỏ sót điểm hợp
 * lệ trên đất liền) và nhỏ hơn 184 km (chặn được mọi điểm ngoài VN trên đo).
 * Vượt trần thì trả null chứ không trả phường tuỳ ý.
 */
export const NEAREST_WARD_MAX_KM = 75;

export type WardCentroid = {
  wardCode: string;
  wardName: string;
  provinceCode: string;
  provinceName: string;
  lat: number;
  lng: number;
};

const FILE_HEADER = '# wardCode\twardName\tprovinceCode\tprovinceName\tlat\tlng';

/**
 * `src/modules/regions/` và `dist/modules/regions/` đều nằm đúng 3 cấp dưới
 * thư mục gốc ứng dụng, nên cùng một đường dẫn tương đối này đúng ở cả ba nơi:
 * chạy `ts-node`/jest trên `src`, chạy `dist`, và trong ảnh Docker (`/app`).
 * Dockerfile đã COPY cả thư mục `seed` sang `/app/seed`.
 */
const FILE_PATH = join(__dirname, '..', '..', '..', 'seed', 'ward-centroids.tsv');

function parse(tsv: string): WardCentroid[] {
  const rows: WardCentroid[] = [];
  const lines = tsv.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    // File TSV do tool Windows sinh ra mang CRLF: cắt \r cuối dòng trước khi
    // so header và tách cột, nếu không dòng 1 luôn lệch FILE_HEADER.
    const line = lines[i].replace(/\r$/, '');
    if (line.length === 0) continue;
    if (i === 0) {
      if (line !== FILE_HEADER) {
        throw new Error(
          `ward-centroids.tsv: dòng tiêu đề sai ở dòng 1, mong đợi "${FILE_HEADER}", nhận "${line}".`,
        );
      }
      continue;
    }
    const parts = line.split('\t');
    if (parts.length !== 6) {
      throw new Error(
        `ward-centroids.tsv: dòng ${i + 1} có ${parts.length} cột, mong đợi 6.`,
      );
    }
    const lat = Number(parts[4]);
    const lng = Number(parts[5]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(
        `ward-centroids.tsv: dòng ${i + 1} có toạ độ không phải số ("${parts[4]}", "${parts[5]}").`,
      );
    }
    rows.push({
      wardCode: parts[0],
      wardName: parts[1],
      provinceCode: parts[2],
      provinceName: parts[3],
      lat,
      lng,
    });
  }
  return rows;
}

function load(): WardCentroid[] {
  let raw: string;
  try {
    raw = readFileSync(FILE_PATH, 'utf8');
  } catch (cause) {
    throw new Error(
      `Không đọc được ${FILE_PATH}. Tâm hình học phường là dữ liệu bắt buộc cho ` +
        `/regions/resolve và /regions/wards/centroid; thiếu file thì hai endpoint ` +
        `này sẽ trả null cho mọi điểm. (${(cause as Error).message})`,
    );
  }
  const rows = parse(raw);
  if (rows.length === 0) {
    throw new Error(
      `${FILE_PATH} rỗng. File phải chứa ít nhất một dòng phường có toạ độ tâm.`,
    );
  }
  return rows;
}

// Nạp ngay khi module được import, tức là lúc ứng dụng khởi động: file hỏng
// phải làm sập boot chứ không được biến thành null âm thầm lúc chạy.
const ALL: WardCentroid[] = load();
const BY_KEY = new Map<string, WardCentroid>(
  ALL.map((w) => [`${w.provinceCode}|${w.wardCode}`, w]),
);

/** Tra đúng một phường theo cặp mã tỉnh + mã phường. */
export function findWardCentroid(
  provinceCode: string,
  wardCode: string,
): WardCentroid | null {
  return BY_KEY.get(`${provinceCode}|${wardCode}`) ?? null;
}
/** Khoảng cách haversine, km. */
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = Math.PI / 180;
  const halfLat = (bLat - aLat) * toRad * 0.5;
  const halfLng = (bLng - aLng) * toRad * 0.5;
  const h =
    Math.sin(halfLat) * Math.sin(halfLat) +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) *
      Math.sin(halfLng) * Math.sin(halfLng);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

/**
 * Phường có tâm gần điểm nhất, hoặc null nếu quá xa.
 *
 * Chỉ là *dự phòng* cho môi trường không có polygon. Nó có thể chọn sai
 * phường khi điểm nằm gần ranh giới giữa hai phường — đo thật trên điểm
 * kiểm tra 21.0278,105.8342 (Hà Nội): `ST_Covers` trả đúng Phường Ô Chợ Dừa,
 * còn tâm gần nhất là Phường Văn Miếu - Quốc Tử Giám cách 980 m.
 */
export function findNearestWardCentroid(
  lat: number,
  lng: number,
): WardCentroid | null {
  let best: WardCentroid | null = null;
  let bestKm = NEAREST_WARD_MAX_KM;
  for (let i = 0; i < ALL.length; i += 1) {
    const w = ALL[i];
    const km = distanceKm(lat, lng, w.lat, w.lng);
    if (km < bestKm) {
      bestKm = km;
      best = w;
      if (km === 0) break;
    }
  }
  return best;
}
