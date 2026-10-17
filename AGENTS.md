# AGENTS.md — Backend API Quản Lý Giải Đấu

NestJS 11 + TypeScript + Drizzle ORM (drizzle-kit 0.31) + PostgreSQL + Jest 30; pnpm (`.npmrc`: node-linker=hoisted).
Omp chỉ tự nạp file này. Luật cấp dự án `D:/Duancanhan/Project_QuanLyGiaiDau/AGENTS.md` KHÔNG tự nạp: mở khi việc đụng an toàn dữ liệu, báo cáo cuối, DB map (mục 11) hoặc đồng bộ API client (mục 10).

## Đọc trước khi làm

1. `docs/README.md`: bản đồ "câu hỏi → file" và nhãn chuẩn / tham khảo / kế hoạch cũ.
2. `INSTRUCTIONS.md`: luật bắt buộc (cấm TypeORM, Prisma, `any`, hard delete; transaction cho tiền; `SELECT ... FOR UPDATE` cho ELO; prefix `/api/v1/`).
3. Đụng schema, migration, SQL: mục "Cơ sở dữ liệu" trong `docs/README.md`.

## Lệnh (đã chạy thật trên origin/main `40ccd95`; exit code trong `docs/README.md`)

- Typecheck: `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --noEmit` → 12 lỗi sẵn trong `*.spec.ts`, không được tăng; exit 2 lần đầu, 1 khi lặp lại (xem `docs/README.md`). Không có script `typecheck`.
- Test: `pnpm test` (jest, 179 file `*.spec.ts`, chưa chạy toàn bộ). Một file: `pnpm exec jest <đường dẫn>`.
- Lint: không có script `lint`; `pnpm exec eslint <file>`. Chưa có số lỗi toàn repo.
- Không có script `db:docs` hay `db:docs:check` trên origin/main.
- Chưa chạy (cần PostgreSQL/Docker): `pnpm test:e2e`, `pnpm db:push`, `node run-prod-migration.js`.
- Bản mô tả API: `pnpm build && pnpm openapi:export` → ghi `openapi.json` (chế độ preview của Nest, không cần DB/Redis). Kiểm hợp đồng trên cloud: `cloud-test-runner.py run --target api-contract --backend-ref <nhánh>` (đỏ khi `openapi.json` đã commit lệch bản xuất, hoặc phá vỡ so với `main` theo oasdiff).

## Quy ước thật trong code

- Module: `src/modules/<tên>/` gồm `<tên>.controller.ts`, `<tên>.service.ts`, `<tên>.module.ts` và thư mục dto.
- Contract HTTP: sự thật là `src/modules/*/*.controller.ts`. Tài liệu endpoint trong `docs/` có thể lệch.
- API mới hoặc API đang sửa: DTO đặt trong file `*.dto.ts`; hàm controller khai kiểu trả về là class DTO (plugin `@nestjs/swagger` trong `nest-cli.json` tự sinh mô tả từ đó; `TransformInterceptor` bọc thành `{statusCode, message, data}` nên kiểu khai là kiểu của `data`). Đổi API thì chạy `pnpm openapi:export` và commit `openapi.json` cùng commit. Thuộc tính phụ không phải trường API (chỉ để gắn validator) gắn `@ApiHideProperty()`.
- Schema Drizzle: `src/database/schema/<nhóm>.schema.ts`, export qua `src/database/schema/index.ts`.
- `.env` không được đọc hay chép; `.env.example` chỉ là mẫu.

## Thay đổi, gộp, deploy

- Kế hoạch mới: OpenSpec `openspec/changes/<id>/` qua `/opsx-propose`, dừng chờ người dùng nói apply. Không ghi plan vào `docs/` hay thư mục cha.
- Làm trong worktree riêng (skill `git-worktree-lanes`); gộp: `python C:/Users/GIGABYTE/.omp/scripts/merge-lane.py <worktree> --check "python C:/Users/GIGABYTE/.omp/scripts/openspec-gate.py"`.
- Push `main` kích hoạt deploy VPS (`.github/workflows/deploy.yml`). Agent KHÔNG push.
- Thêm hay đổi vai trò một tài liệu: sửa `docs/README.md` trong cùng commit.
