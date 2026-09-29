// seed-ward-boundaries.js - Nạp ranh giới hành chính (polygon) cho bảng `wards`.
//
// Nguồn: github.com/thanglequoc/vietnamese-provinces-database
//   dataset-generation-scripts/resources/gis/geojson_11Mar2026/
//     {maTinh}_{slugTenTinh}/wards/{maPhuong}_{slugTenPhuong}.geojson
//
// Cây GeoJSON được tải về sẵn dưới .cache/geojson_11Mar2026 và đọc thẳng từ
// đĩa, nên script chạy hoàn toàn offline, không tốn quota API nào.

// JOIN THEO TÊN, TUYỆT ĐỐI KHÔNG JOIN THEO MÃ — ba hệ mã độc lập nhau:
//   TP.HCM      provinces v2 code = 79   | tên thư mục 29_ho_chi_minh | matinhxa "29.185"
//   Phường Phú Lâm  v2 code = 27349      | tên file 101_phu_lam_phuong   | ma1 185
//   Nên tên chuẩn hoá là khoá duy nhất đáng tin; mã chỉ dùng để ghi vào DB.
//
// Có thể chạy lại nhiều lần: UPDATE theo wards.code là idempotent, và mỗi lần
// chạy đều xoá sạch ranh giới của các phường mà lần đó KHÔNG khớp — nếu không
// thì một polygon sai từ lần chạy cũ sẽ sống mãi và ST_Contains trả về tên
// phường sai cho điểm thật.
//
// Cơ chế khớp, theo thứ tự ưu tiên:
//   1. seed/region-boundary-overrides.json — ánh xạ tay, luôn thắng.
//   2. Tên: thử lần lượt các khoá suy ra từ tên file (xem
//      wardKeyCandidatesFromFileName) cho tới khi trúng một khoá.
//   3. Khoá trùng (hai đơn vị chỉ khác dấu) thì CỐ TÌNH bỏ trống, không đoán.
//
// Dừng (exit 1) nếu còn đơn vị chưa khớp, in ra slug để đối chiếu và bổ sung
// tay vào seed/region-boundary-overrides.json.

'use strict';

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Cây GeoJSON cục bộ, xếp đúng cấu trúc URL cũ:
//   <root>/{maTinh}_{slugTenTinh}/wards/{maPhuong}_{slugTenPhuong}.geojson
const GEOJSON_ROOT = path.resolve(
  __dirname,
  process.env.WARD_BOUNDARY_GEOJSON_DIR || path.join('.cache', 'geojson_11Mar2026'),
);
const OVERRIDES_FILE = path.resolve(__dirname, 'seed', 'region-boundary-overrides.json');
const BATCH_SIZE = 50;

function assertGeoJsonRoot() {
  if (fs.existsSync(GEOJSON_ROOT) && fs.statSync(GEOJSON_ROOT).isDirectory()) return;
  throw new Error(
    [
      `Không tìm thấy cây GeoJSON cục bộ tại ${GEOJSON_ROOT}.`,
      'Tải một lần rồi chạy lại (script cố tình không tự tải để chạy được ngoài mạng):',
      '  git clone --filter=blob:none --sparse --depth 1 https://github.com/thanglequoc/vietnamese-provinces-database.git .tmp/vpdb',
      '  git -C .tmp/vpdb sparse-checkout set dataset-generation-scripts/resources/gis/geojson_11Mar2026',
      '',
      'Rồi chuyển .tmp/vpdb/dataset-generation-scripts/resources/gis/geojson_11Mar2026 sang:',
      `  ${GEOJSON_ROOT}`,
      'Hoặc trỏ thẳng một thư mục khác qua biến môi trường WARD_BOUNDARY_GEOJSON_DIR.',
    ].join('\n'),
  );
}

const sql = postgres({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_DATABASE || 'tournament_db',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  prepare: false,
  max: 1,
  connection: { search_path: 'public' },
});

/**
 * Nhân bản NGUYÊN VĂN removeVietnameseTones từ
 * HethongFrontEndApp_QLgiaidau/lib/core/utils/vietnam_address_parser.dart:4
 * (giữ nguyên cả 9 regex bỏ dấu). Hàm Dart bỏ dấu rồi ép về [a-z0-9\s];
 * bản JS dưới đây dừng ở bước bỏ dấu, phần lọc ký tự do slugify() đảm nhiệm.
 */
function removeVietnameseTones(str) {
  if (!str) return '';
  let result = str.toLowerCase();
  result = result.replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a');
  result = result.replace(/[èéẹẻẽêềếệểễ]/g, 'e');
  result = result.replace(/[ìíịỉĩ]/g, 'i');
  result = result.replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o');
  result = result.replace(/[ùúụủũưừứựửữ]/g, 'u');
  result = result.replace(/[ỳýỵỷỹ]/g, 'y');
  result = result.replace(/đ/g, 'd');
  return result;
}

/** Bỏ dấu + hạ chữ thường + loại mọi ký tự ngoài [a-z0-9]. */
function slugify(value) {
  return removeVietnameseTones(value).replace(/[^a-z0-9]/g, '');
}

// open-api.vn v2 đặt tên đơn vị cấp tỉnh theo tiền tố hành chính, và tên thư
// mục GeoJSON cũng mang chính tiền tố đó (`10_tinh_quang_ninh`,
// `22_thanh_pho_quang_ninh`). Vì vậy phải bỏ tiền tố trên CẢ hai vế trước khi
// so — chỉ bỏ ở vế tên DB thì `quangninh` != `tinhquangninh` và mọi tỉnh mang
// tiền tố đều rơi ra ngoài danh sách khớp.
const PROVINCE_PREFIXES = [
  'thành phố trực thuộc trung ương ',
  'thành phố ',
  'thu đo ',
  'tỉnh ',
];
// Hậu tố đơn vị cấp phường trong tên file GeoJSON.
const WARD_SUFFIXES = ['_phuong', '_xa', '_dac_khu', '_thi_tran'];
const WARD_PREFIXES = ['phường ', 'xã ', 'đặc khu ', 'thị trấn '];
function provinceKeyFromDbName(name) {
  return slugify(stripPrefix(name, PROVINCE_PREFIXES));
}

function provinceKeyFromDirName(dirName) {
  return slugify(
    stripPrefix(dirName.split('_').slice(1).join(' '), PROVINCE_PREFIXES),
  );
}

function stripPrefix(value, prefixes) {
  const lower = removeVietnameseTones(value);
  for (const prefix of prefixes) {
    const normalizedPrefix = removeVietnameseTones(prefix);
    if (lower.startsWith(normalizedPrefix)) {
      return value.slice(prefix.length).trim();
    }
  }
  return value.trim();
}

function wardKeyFromDbName(name) {
  return slugify(stripPrefix(name, WARD_PREFIXES));
}

// Một tên file có THỂ mang hậu tố loại đơn vị hoặc không, và ta không biết
// trước: `101_phu_lam_phuong` là "Phường Phú Lâm" (hậu tố `_phuong` là loại
// đơn vị) nhưng `25_khuat_xa` là "Xã Khuất Xá" — chữ "Xá" CUỐI TÊN cũng là
// tên riêng, không phải hậu tố. Cắt mù một hậu tố sẽ ra khoá "khuat" thay vì
// "khuatsxa" và rơi khỏi DB. Vì vậy thử CẢ HAI dạng rồi mới kết luận.
function wardKeyCandidatesFromFileName(fileName) {
  const base = fileName.replace(/\.geojson$/i, '').split('_').slice(1).join('_');
  const lower = removeVietnameseTones(base);
  const candidates = [slugify(base)];
  for (const suffix of WARD_SUFFIXES) {
    if (lower.endsWith(removeVietnameseTones(suffix))) {
      candidates.push(slugify(base.slice(0, base.length - suffix.length)));
      break;
    }
  }
  return candidates;
}

function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_FILE)) {
    fs.mkdirSync(path.dirname(OVERRIDES_FILE), { recursive: true });
    fs.writeFileSync(OVERRIDES_FILE, '{}\n', 'utf8');
    return {};
  }
  const parsed = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
  // Khoá bắt đầu bằng "_" là ghi chú cho người đọc, không phải ánh xạ tên file.
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => !key.startsWith('_')));
}

/**
 * Liệt kê một thư mục trong cây GeoJSON cục bộ. `relDir` là đường dẫn tương đối
 * so với GEOJSON_ROOT (rỗng = thư mục gốc), thay cho URL thư mục của API cũ.
 * Trả về đúng các trường `main()` dùng: name, type, path.
 */
function listLocalDir(relDir) {
  const absDir = path.resolve(GEOJSON_ROOT, relDir);
  return fs
    .readdirSync(absDir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
      path: path.join(absDir, entry.name),
    }));
}

function fetchGeoJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * File có thể là Polygon, MultiPolygon, hoặc FeatureCollection chứa lẫn lộn.
 * Trả về geometry duy nhất đã ép về MultiPolygon để khớp kiểu cột.
 */
function toMultiPolygonGeometry(geoJson) {
  const raw =
    geoJson.type === 'FeatureCollection'
      ? geoJson.features.map((feature) => feature.geometry).filter(Boolean)
      : [geoJson];

  const polygons = [];
  for (const geometry of raw) {
    if (!geometry) continue;
    if (geometry.type === 'Polygon') polygons.push(...geometry.coordinates);
    else if (geometry.type === 'MultiPolygon') polygons.push(...geometry.coordinates);
    else throw new Error(`Unsupported geometry type: ${geometry.type}`);
  }
  if (polygons.length === 0) throw new Error('GeoJSON contains no polygon');
  return { type: 'MultiPolygon', coordinates: polygons };
}

async function main() {
  assertGeoJsonRoot();
  const overrides = loadOverrides();
  const unmatchedProvinces = [];
  const unmatchedWards = [];

  const provinces = await sql`SELECT code, name FROM provinces`;
  // ORDER BY để khoá trùng bị giải quyết theo thứ tự ổn định giữa các lần chạy.
  const wards = await sql`SELECT code, name, province_code FROM wards ORDER BY code`;
  const wardsByProvince = new Map();
  for (const ward of wards) {
    const list = wardsByProvince.get(ward.province_code) || [];
    list.push(ward);
    wardsByProvince.set(ward.province_code, list);
  }

  const provinceByKey = new Map();
  for (const province of provinces) {
    provinceByKey.set(provinceKeyFromDbName(province.name), province);
  }

  const dirs = listLocalDir('').filter((entry) => entry.type === 'dir');
  console.log(`📂 ${dirs.length} thư mục tỉnh trong nguồn GeoJSON`);

  let updatedWards = 0;
  const provinceWards = new Map();

  for (const dir of dirs) {
    const dirKey = provinceKeyFromDirName(dir.name);
    const overrideCode = overrides[dir.name];
    const province =
      (overrideCode && provinces.find((p) => p.code === String(overrideCode))) ||
      provinceByKey.get(dirKey);

    if (!province) {
      unmatchedProvinces.push(dir.name);
      console.warn(`   ⚠️  Không khớp tỉnh: ${dir.name} (key "${dirKey}") — bỏ qua cả thư mục`);
      continue;
    }

    const files = listLocalDir(path.join(dir.name, 'wards')).filter(
      (entry) => entry.type === 'file' && entry.name.endsWith('.geojson'),
    );
    // Lưu DANH SÁCH ward theo khoá chứ không lưu một ward: hai đơn vị thật sự
    // khác nhau có thể trùng khoá sau khi bỏ dấu (Hải Phòng "Cẩm Giang" vs
    // "Cẩm Giàng", Thái Nguyên "Văn Lang" vs "Văn Lăng"). Với khoá trùng thì
    // TÊN KHÔNG phân biệt được — đoán bừa sẽ ghi nhầm polygon và ST_Contains
    // trả về tên phường sai cho điểm thật, tệ hơn nhiều so với để trống.
    const wardsByKey = new Map();
    for (const ward of wardsByProvince.get(province.code) || []) {
      const key = wardKeyFromDbName(ward.name);
      const list = wardsByKey.get(key) || [];
      list.push(ward);
      wardsByKey.set(key, list);
    }

    // Chiều ngược: ward trong DB mà KHÔNG file nào ăn được. Vòng lặp file chỉ
    // nhìn thấy file, nên không đếm ở đây thì báo cáo "còn thiếu" sẽ đẹp giả.
    const claimedWardCodes = new Set();

    for (const file of files) {
      const overrideWardCode = overrides[file.name];
      const candidates = wardKeyCandidatesFromFileName(file.name);
      let ward = null;

      if (overrideWardCode) {
        // Ánh xạ tay phải thắng mọi khoá suy ra từ tên, nên tra nó trước.
        ward = wards.find((w) => w.code === String(overrideWardCode)) || null;
        if (!ward) {
          unmatchedWards.push(
            `${dir.name}/${file.name} — override "${overrideWardCode}" không có trong DB`,
          );
          continue;
        }
      } else {
        let ambiguous = false;
        for (const key of candidates) {
          const list = wardsByKey.get(key);
          if (!list) continue;
          if (list.length === 1) {
            ward = list[0];
            break;
          }
          ambiguous = true;
          unmatchedWards.push(
            `${dir.name}/${file.name} — khoá "${key}" khớp ${list.length} đơn vị khác nhau `
              + `(${list.map((w) => `"${w.name}" ${w.code}`).join(' / ')}); tên không phân biệt được, bỏ qua`,
          );
          break;
        }
        if (ambiguous) continue;
      }

      if (!ward) {
        unmatchedWards.push(
          `${dir.name}/${file.name} (thử khoá ${candidates.map((k) => `"${k}"`).join(', ')})`,
        );
        continue;
      }
      claimedWardCodes.add(ward.code);
      provinceWards.set(ward.code, { file, ward });
    }

    for (const ward of wardsByProvince.get(province.code) || []) {
      if (claimedWardCodes.has(ward.code)) continue;
      const key = wardKeyFromDbName(ward.name);
      const twins = wardsByKey.get(key) || [];
      unmatchedWards.push(
        `${ward.name} (key "${key}"${twins.length > 1 ? ', trùng khoá với đơn vị khác cùng tỉnh' : ''}) `
          + `— không có file nào khớp trong ${dir.name}`,
      );
    }
  }

  console.log(`🔗 Khớp tên: ${provinceWards.size} phường/xã`);

  const entries = [...provinceWards.values()];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const geometries = [];
    for (const entry of chunk) {
      const geoJson = fetchGeoJson(entry.file.path);
      geometries.push(JSON.stringify(toMultiPolygonGeometry(geoJson)));
    }
    // ST_GeomFromGeoJSON mặc định SRID 4326 cho GeoJSON nên khớp cột
    // geography(...,4326). ST_Multi chuẩn hoá Polygon -> MultiPolygon.
    // Điểm tâm lấy bằng hàm point-on-surface của PostGIS, KHÔNG dùng tâm
    // hình học: với ward lõm / nhiều đảo / kéo dài, tâm ấy có thể nằm NGOÀI
    // ranh giới, khiến pin tự đặt cho host rơi vào phường bên cạnh — pin vẫn
    // lưu được và vẫn trông hợp lệ, nên lỗi này hoàn toàn im lặng.
    // point-on-surface luôn trả về một điểm nằm bên trong ward.
    const rows = await sql`
      UPDATE wards AS w SET
        boundary = ST_Multi(ST_GeomFromGeoJSON(g.geojson))::geography,
        center_lat = ST_Y(ST_PointOnSurface(ST_Multi(ST_GeomFromGeoJSON(g.geojson))::geometry)),
        center_lng = ST_X(ST_PointOnSurface(ST_Multi(ST_GeomFromGeoJSON(g.geojson))::geometry))
      FROM (SELECT unnest(${geometries}::text[]) AS geojson, unnest(${chunk.map((e) => e.ward.code)}::varchar[]) AS code) AS g
      WHERE w.code = g.code
      RETURNING w.code
    `;
    updatedWards += rows.length;
    console.log(`  → ${Math.min(i + BATCH_SIZE, entries.length)}/${entries.length} (cập nhật ${updatedWards})`);
  }

  // Xoá phần dư của các lần chạy trước. Một ward không khớp ở lần này không
  // được giữ lại polygon cũ: nó có thể là kết quả của một lần khớp sai, và
  // ST_Contains sẽ trả về tên phường SAI cho điểm thật — tệ hơn hẳn NULL.
  const staleCleared = await sql`
    UPDATE wards
    SET boundary = NULL, center_lat = NULL, center_lng = NULL
    WHERE boundary IS NOT NULL AND NOT (code = ANY(${entries.map((e) => e.ward.code)}::varchar[]))
    RETURNING code
  `;
  if (staleCleared.length > 0) {
    console.log(`🧹 Đã xoá ${staleCleared.length} ranh giới cũ của phường không khớp lần này`);
  }

  const coverage = await sql`
    SELECT
      count(*)::int AS total,
      count(boundary)::int AS with_boundary,
      count(*) FILTER (WHERE boundary IS NULL)::int AS without_boundary
    FROM wards
  `;
  const [cov] = coverage;
  console.log(
    `📊 DB: ${cov.with_boundary}/${cov.total} phường có ranh giới, ${cov.without_boundary} chưa có`,
  );

  if (unmatchedProvinces.length > 0 || unmatchedWards.length > 0) {
    console.error('\n❌ Còn đơn vị chưa khớp tên:');
    for (const name of unmatchedProvinces) console.error(`  [tỉnh] ${name}`);
    for (const name of unmatchedWards) console.error(`  [phường] ${name}`);
    console.error(
      `\nThêm ánh xạ tay vào ${path.relative(__dirname, OVERRIDES_FILE)} rồi chạy lại.`,
    );
    process.exitCode = 1;
    return;
  }

  if (updatedWards === 0) {
    console.error('❌ Không cập nhật được phường nào — kiểm tra lại tên trong DB.');
    process.exitCode = 1;
    return;
  }

  console.log(`✅ Hoàn tất. matched=${provinceWards.size} updated=${updatedWards} unmatched=0`);
}

main()
  .catch((error) => {
    console.error('❌ Lỗi:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 10 }));
