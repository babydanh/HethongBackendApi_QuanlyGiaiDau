# Proposal

## Why

Bản mô tả API (OpenAPI) mà Backend sinh ra thiếu nhiều thông tin, và hiện không có gì phát hiện khi Backend đổi API làm vỡ Web/App:

- Có 512 route, chỉ 63 chỗ khai báo kiểu trả về (`@ApiOkResponse`/`@ApiResponse`).
- 373 hàm controller không khai báo kiểu trả về.
- `nest-cli.json` chưa bật plugin Swagger, nên DTO nào không có `@ApiProperty` tay thì không xuất hiện trong mô tả.

E2E vòng đời giải ngày 17/10/2026 bắt được lỗi lệch giữa Web và Backend. Ví dụ: header `Idempotency-Key` Web gửi nhưng CORS của Backend không cho phép. Loại lỗi này chỉ lộ ra khi chạy thật.

Người dùng chốt hướng: bật công cụ có sẵn và thêm bước so hợp đồng API trên CI.

## What Changes

- **Bật plugin `@nestjs/swagger`** trong `nest-cli.json`. Plugin tự sinh mô tả DTO từ kiểu TypeScript và tự gắn kiểu trả về cho endpoint có khai kiểu hàm. Tuỳ chọn:
  - `introspectComments: true`;
  - `classValidatorShim: true`;
  - `skipAutoHttpCode: true`, để không đổi mã trạng thái HTTP đang chạy.
- **Tách phần tạo bản mô tả** ra `src/openapi/openapi-document.ts`, dùng chung cho `main.ts` (trang `/api/docs`) và lệnh xuất file.
- **Lệnh `pnpm openapi:export`** (`src/openapi/export-openapi.ts`):
  - dựng app ở chế độ `preview` của Nest, không kết nối DB/Redis;
  - ghi `openapi.json` ở gốc repo;
  - file này được commit, nên mỗi lần đổi API sẽ thấy rõ trong diff.
- **Luật cho API mới** trong `AGENTS.md`:
  - DTO đặt trong file `*.dto.ts`;
  - hàm controller khai kiểu trả về là class DTO;
  - đổi API thì chạy `pnpm openapi:export` rồi commit `openapi.json`.
- **Ngoài repo này:** target `api-contract` trong `agent-orchestrator/.github/workflows/test-runner.yml` và `~/.omp/scripts/cloud-test-runner.py`. Job này:
  - build;
  - xuất bản mô tả;
  - báo đỏ nếu `openapi.json` đã commit khác bản vừa xuất (quên chạy lệnh);
  - chạy `oasdiff breaking` so với `openapi.json` trên `main`, báo đỏ khi có thay đổi phá vỡ (xoá route, xoá trường, đổi kiểu, thêm trường bắt buộc).

### Out of scope (KHÔNG làm)

- Không bổ sung kiểu trả về cho 373 hàm controller cũ. Luật chỉ áp cho API mới hoặc API đang sửa.
- Không sinh client cho Web/App (Web/App giữ lớp gọi API viết tay). Không thêm package mới; dùng `@nestjs/swagger` đã có.
- Không đổi hành vi API, không đổi `TransformInterceptor`.
- Chưa thêm Schemathesis (fuzz API theo mô tả): để sau khi bản mô tả đủ tốt.
- Chưa đưa `api-contract` vào cổng gộp `merge-lane.py`. Bước này làm sau khi chạy ổn vài lượt.

## Capabilities

### New Capabilities

(không có: công cụ phát triển, `skip_specs: true`)

### Modified Capabilities

(không có)

## Impact

- **Repo này:**
  - `nest-cli.json`;
  - `src/main.ts` (dùng hàm chung, giữ nguyên `/api/docs`);
  - `src/openapi/*` (mới);
  - `package.json` (script `openapi:export`);
  - `openapi.json` (mới, sinh ra);
  - `AGENTS.md`, `docs/README.md`.
- **Rủi ro:** plugin chạy lúc `nest build`, nên lỗi phân tích DTO (nếu có) sẽ hiện ở bước build. Trên CI, build xanh mới gộp.
- **Web/App:** không đổi code. Về sau có thể dùng `openapi.json` để sinh kiểu dữ liệu (`quicktype` của Botkeep hoặc `openapi-typescript`).
- **Deploy:** gộp vào `main` sẽ deploy Backend. Hành vi API không đổi, chỉ trang `/api/docs` có thêm mô tả.
