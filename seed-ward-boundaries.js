// seed-ward-boundaries.js - Nạp ranh giới hành chính (polygon) cho bảng `wards`.
//
// Nguồn: github.com/thanglequoc/vietnamese-provinces-database
//   dataset-generation-scripts/resources/gis/geojson_11Mar2026/
//     {maTinh}_{slugTenTinh}/wards/{maPhuong}_{slugTenPhuong}.geojson
//
// Cây GeoJSON nằm dưới .cache/geojson_11Mar2026 và được đọc thẳng từ đĩa.
// Máy chưa có thì script tự tải bằng git sparse-checkout (xem ensureGeoJsonTree).

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
// Trước hết: máy chưa có cây GeoJSON (thư mục .cache bị gitignore nên runner CI
// không có) thì tự tải bằng git sparse-checkout — KHÔNG dùng file zip, lý do ở
// downloadGeoJsonTree.
//
// ── HỢP ĐỒNG CHO JOB CI DEPLOY ──────────────────────────────────────────────
// Chạy từ thư mục HethongBackendApi_QuanlyGiaiDau, SAU run-prod-migration.js:
//   1) node seed-regions-v2.js        # thay provinces/wards trong 1 transaction
//   2) node seed-ward-boundaries.js   # nạp ranh giới (tự tải GeoJSON ~630 MB)
// Biến môi trường bắt buộc: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD,
// DB_DATABASE (hoặc thay cả bằng DATABASE_URL); thêm DB_SSL=true nếu Postgres
// cần TLS. Job CI chạy hai script này trong container `migrate` trên VPS, nên
// biến môi trường đến từ .env của compose chứ không phải từ secret CI.
// Thời gian: ~4-6 phút (~630 MB tải về lần đầu + 3321 lệnh UPDATE theo lô 50).
// Job CI phải để timeout >= 15 phút, nếu không sẽ chết giữa chừng.
//
// EXIT CODE — hai tín hiệu TÁCH BIỆT, cố ý không gộp:
//   0  = xong. Kể cả khi còn phường chưa có ranh giới: 16/3321 phường
//        (trùng tên chỉ khác dấu) là KHÔNG QUYẾT ĐỊNH ĐƯỢC, đoán bừa sẽ ghi
//        nhầm polygon. Trạng thái đó chỉ làm /regions/resolve trả null ở đúng
//        vài điểm đó, nên đỏ pipeline mỗi lần đẩy là vô nghĩa.
//   ≠0 = hỏng thật: không tải/không đọc được GeoJSON, mất kết nối, cập nhật 0
//        phường, hoặc ĐỘ PHỦ dưới WARD_BOUNDARY_MIN_COVERAGE (mặc định 99).
//        Đây mới là chốt chặn cho cây GeoJSON bị cắt cụt hoặc tên khớp hỏng.

'use strict';

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const { execFileSync } = require('child_process');
const os = require('os');

require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Cây GeoJSON cục bộ, xếp đúng cấu trúc URL cũ:
//   <root>/{maTinh}_{slugTenTinh}/wards/{maPhuong}_{slugTenPhuong}.geojson
const GEOJSON_ROOT = path.resolve(
  __dirname,
  process.env.WARD_BOUNDARY_GEOJSON_DIR || path.join('.cache', 'geojson_11Mar2026'),
);
// Nguồn để tự tải khi máy chưa có cây GeoJSON (xem downloadGeoJsonTree).
const GEOJSON_REPO_URL =
  process.env.WARD_BOUNDARY_GEOJSON_REPO
  || 'https://github.com/thanglequoc/vietnamese-provinces-database.git';
const GEOJSON_REPO_REF = process.env.WARD_BOUNDARY_GEOJSON_REF || 'master';
const GEOJSON_REPO_SUBDIR = 'dataset-generation-scripts/resources/gis/geojson_11Mar2026';
const OVERRIDES_FILE = path.resolve(__dirname, 'seed', 'region-boundary-overrides.json');
const BATCH_SIZE = 50;
// Ngưỡng độ phủ (%) — ĐÂY LÀ chốt chặn duy nhất, thay cho "còn phường chưa
// khớp tên thì đỏ". Mặc định 99 vì trạng thái đã biết là 3305/3321 =
// 99.52%: 16 phường trùng tên chỉ khác dấu là không quyết định được, nên 100
// sẽ đỏ vĩnh viễn và làm mất tác dụng của cảnh báo.
// 99 cho phép tối đa 33 phường thiếu ranh giới: 16 lệch sẵn + 17 để dư. Một
// tỉnh nhỏ nhất cũng ~30 phường nên chỉ cần hụt trọn một tỉnh là tụt dưới
// ngưỡng; cây GeoJSON bị cắt cụt (mất nhiều tỉnh) tụt rất xa. Ngưỡng 99.5 thì
// quá sát 99.52 — chỉ cần thêm MỘT phường lệch là đỏ, tức biến CI thành
// canh báo quá mức. Job deploy đặt WARD_BOUNDARY_MIN_COVERAGE tường minh.
const MIN_COVERAGE = Number(process.env.WARD_BOUNDARY_MIN_COVERAGE ?? 99);

/** Cây GeoJSON dùng được: có ít nhất một thư mục tỉnh chứa thư mục `wards`. */
function hasGeoJsonTree(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return false;
  return fs.readdirSync(root, { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'wards')),
  );
}

/**
 * Chạy git, để stdout/stderr ra log để job CI lưu lại được nguyên nhân hỏng.
 * core.longpaths: đường dẫn tới file GeoJSON đã dài ~150 ký tự, cộng thư mục
 * tạm trên Windows dễ vượt giới hạn 260 ký tự.
 */
function git(args, cwd) {
  execFileSync('git', ['-c', 'core.longpaths=true', ...args], {
    cwd,
    stdio: ['ignore', 'inherit', 'inherit'],
    timeout: 60 * 60 * 1000,
  });
}

/**
 * Tải cây GeoJSON bằng git sparse-checkout — KHÔNG dùng file zip.
 *
 * Lý do: tải zip của codeload rồi giải nén bằng `tar` trên Windows đã âm thầm
 * bỏ dấu tên (`1_thu_đo_ha_noi` -> `1_thu_do_ha_noi`) và sinh 1031 file
 * "sinh đôi" ASCII, làm hỏng cả lần khớp tên. Object store của git giữ nguyên
 * byte tên nên checkout ra đúng y như trên nguồn, trên mọi OS.
 *
 * `--filter=blob:none --depth 1` chỉ tải cây thư mục (~400 KB) trước; blob
 * GeoJSON (~630 MB) được tải riêng cho đúng nhánh sparse đang cần.
 */
function downloadGeoJsonTree() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ward-geojson-'));
  const cloneDir = path.join(workDir, 'r');
  try {
    git(
      [
        'clone', '--filter=blob:none', '--sparse', '--depth', '1',
        '--branch', GEOJSON_REPO_REF, GEOJSON_REPO_URL, cloneDir,
      ],
      workDir,
    );
    git(['sparse-checkout', 'set', GEOJSON_REPO_SUBDIR], cloneDir);
    git(['checkout'], cloneDir);

    const checkedOut = path.join(cloneDir, ...GEOJSON_REPO_SUBDIR.split('/'));
    if (!fs.existsSync(checkedOut)) {
      throw new Error(
        `${GEOJSON_REPO_SUBDIR} không tồn tại ở ref "${GEOJSON_REPO_REF}" của ${GEOJSON_REPO_URL}`,
      );
    }

    fs.mkdirSync(path.dirname(GEOJSON_ROOT), { recursive: true });
    if (fs.existsSync(GEOJSON_ROOT)) {
      // Chỉ tới được khi thư mục không dùng được (thiếu hoặc hỏng), nhưng vẫn
      // là lệnh xoá dữ liệu trên đường dẫn người dùng chỉ định — phải in ra.
      console.warn(`🧹 Xoá thư mục cache cũ không dùng được: ${GEOJSON_ROOT}`);
      fs.rmSync(GEOJSON_ROOT, { recursive: true, force: true });
    }
    try {
      fs.renameSync(checkedOut, GEOJSON_ROOT);
    } catch (error) {
      // EXDEV: thư mục tạm và thư mục đích khác ổ đĩa (rất dễ xảy ra trên Windows).
      if (error.code !== 'EXDEV') throw error;
      fs.cpSync(checkedOut, GEOJSON_ROOT, { recursive: true });
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/**
 * Chặn hỏng tên do bỏ dấu: hai thư mục tỉnh chỉ khác nhau ở dấu sẽ gộp thành
 * một khoá. Cây giả (zip giải nén sai) tạo đúng loại "sinh đôi" này, nên
 * phải chặn ngay khi tải xong thay vì để lần khớp tên chạy sai rồi mới báo.
 */
function assertNoTwinProvinceDirs(root) {
  const seen = new Map();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const key = provinceKeyFromDirName(entry.name);
    const twin = seen.get(key);
    if (twin) {
      throw new Error(
        `Cây GeoJSON bị hỏng tên: "${entry.name}" và "${twin}" gộp cùng khoá "${key}". `
        + 'Tên trên đĩa đã mất dấu — tải lại bằng git, đừng giải nén file zip.',
      );
    }
    seen.set(key, entry.name);
  }
}

/** Bảo đảm cây GeoJSON có trên đĩa và tên không bị mất dấu; tải về nếu chưa có. */
function ensureGeoJsonTree() {
  // Kiểm tra cả cây ĐÃ CÓ SẴN: máy giải nén zip sai sẽ mang "sinh đôi" ASCII,
  // và đó là nguyên nhân lần chạy trước khớp sai tên chứ không phải lỗi dữ liệu.
  if (fs.existsSync(GEOJSON_ROOT)) assertNoTwinProvinceDirs(GEOJSON_ROOT);

  if (hasGeoJsonTree(GEOJSON_ROOT)) {
    console.log(`📂 Dùng cây GeoJSON có sẵn tại ${GEOJSON_ROOT}`);
    return;
  }

  console.log(
    `📥 Chưa có cây GeoJSON — đang tải ~630 MB từ ${GEOJSON_REPO_URL} `
    + `(ref ${GEOJSON_REPO_REF}), có thể mất vài phút...`,
  );
  const startedAt = Date.now();
  downloadGeoJsonTree();
  assertNoTwinProvinceDirs(GEOJSON_ROOT);
  if (!hasGeoJsonTree(GEOJSON_ROOT)) {
    throw new Error(`Vừa tải xong nhưng ${GEOJSON_ROOT} vẫn không dùng được.`);
  }
  console.log(`✅ Đã tải cây GeoJSON trong ${Math.round((Date.now() - startedAt) / 1000)}s.`);
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
  ensureGeoJsonTree();
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

  const unmatchedTotal = unmatchedProvinces.length + unmatchedWards.length;
  const coveragePercent = cov.total > 0 ? (cov.with_boundary / cov.total) * 100 : 0;

  // Tín hiệu MỘT, KHÔNG phải lỗi. Trùng tên chỉ khác dấu thì không thể khớp
  // mà không đoán, và đoán sẽ ghi nhầm polygon cho cả một vùng. Vì vậy thiếu
  // ranh giới chỉ in cảnh báo to rồi exit 0; muốn đỏ thì hạ
  // WARD_BOUNDARY_MIN_COVERAGE chứ không phải để exit code theo số đơn vị lệch.
  // Lưu ý: cảnh báo này KHÔNG tự khẳng định "exit 0" — lần chạy vẫn có thể đỏ
  // vì độ phủ tụt dưới ngưỡng ở dưới, và nói trước "vẫn 0" rồi đỏ thì log
  // tự mâu thuẫn.
  if (cov.without_boundary > 0) {
    console.warn(
      `\n⚠️  ${cov.without_boundary}/${cov.total} phường chưa có ranh giới `
      + `(${(100 - coveragePercent).toFixed(2)}% chưa phủ).`
      + (coveragePercent < MIN_COVERAGE
        ? ' Dưới ngưỡng — lần chạy này SẼ ĐỎ, xem nguyên nhân ở cuối.'
        : ' Đây là trạng thái ĐÃ BIẾT VÀ ĐƯỢC CHẤP NHẬN — không phải lỗi, exit code vẫn 0.'),
    );
    console.warn(
      '   /regions/resolve sẽ trả null ở đúng những điểm nằm trong các phường này.',
    );
  }
  if (unmatchedTotal > 0) {
    console.warn(`\n⚠️  ${unmatchedTotal} đơn vị chưa khớp tên:`);
    for (const name of unmatchedProvinces) console.warn(`  [tỉnh] ${name}`);
    for (const name of unmatchedWards) console.warn(`  [phường] ${name}`);
    console.warn(
      `\nMuốn phủ nốt: thêm ánh xạ tay vào ${path.relative(__dirname, OVERRIDES_FILE)} rồi chạy lại.`,
    );
  }

  // Chốt chặn DUY NHẤT cho lần nhập hỏng: độ phủ tụt dưới ngưỡng thì hoặc cây
  // GeoJSON bị cắt cụt, hoặc tên trong DB đã đổi. Hai nguyên nhân đó hậu quả
  // giống nhau — hàng trăm phường mất polygon và ST_Contains trả sai tên cho
  // điểm thật — nên phải đỏ, khác hẳn vài phường không quyết định được ở trên.
  if (coveragePercent < MIN_COVERAGE) {
    console.error(
      '\n❌ ĐỘ PHỦ RANH GIỚI THẤP HƠN NGƯỠNG — coi như lần nhập đã hỏng, KHÔNG phải vài phường lệch.'
      + `\n   Có ranh giới : ${cov.with_boundary}/${cov.total} (${coveragePercent.toFixed(2)}%)`
      + `\n   Ngưỡng       : ${MIN_COVERAGE}% (WARD_BOUNDARY_MIN_COVERAGE)`
      + `\n   Thiếu         : ${cov.without_boundary} phường`
      + '\n   Hai nguyên nhân thường gặp:'
      + '\n     1) Cây GeoJSON bị CẮT CỤT — sparse-checkout tải thiếu, ref trên nguồn đổi,'
      + '\n        hoặc WARD_BOUNDARY_GEOJSON_DIR trỏ vào thư mục GeoJSON cũ/partial.'
      + '\n        Cách kiểm: xoá cache (mặc định .cache/geojson_11Mar2026) rồi chạy lại.'
      + `\n     2) TÊN KHỚP HỎNG — API provinces đổi tên hoặc đổi cấu trúc nên tên trong DB`
      + `\n        không còn khớp tên file nữa, và ${path.relative(__dirname, OVERRIDES_FILE)}`
      + '\n        không còn bám được. Danh sách đơn vị chưa khớp tên in ở trên là đầu mối.',
    );
    process.exitCode = 1;
    return;
  }

  if (updatedWards === 0) {
    console.error('❌ Không cập nhật được phường nào — kiểm tra lại tên trong DB.');
    process.exitCode = 1;
    return;
  }

  console.log(
    `✅ Hoàn tất. matched=${provinceWards.size} updated=${updatedWards} `
    + `unmatched=${unmatchedTotal} coverage=${coveragePercent.toFixed(2)}%`,
  );
}

main()
  .catch((error) => {
    console.error('❌ Lỗi:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 10 }));
