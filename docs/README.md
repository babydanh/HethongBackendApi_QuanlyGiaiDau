# Bản đồ tài liệu — Backend API Quản Lý Giải Đấu

Một câu hỏi, một nơi trả lời. Đọc bảng dưới trước khi mở tài liệu khác. Tạo hay đổi vai trò một tài liệu thì sửa bảng này trong cùng commit.

Nhãn:
- **chuẩn**: đọc và làm theo. Khi các nguồn chuẩn mâu thuẫn: `INSTRUCTIONS.md` thắng, báo người dùng.
- **tham khảo**: đúng ý tưởng, chi tiết có thể đã lệch code; đối chiếu code trước khi dựa vào.
- **kế hoạch cũ**: ghi ý định tại một thời điểm, KHÔNG phải mô tả hệ thống hiện tại. Không lấy làm sự thật.

Mốc kiểm: commit `40ccd95` trên `origin/main`, ngày 2026-10-15. Mọi lệnh ghi trong file này đã chạy thật trên mốc đó, trừ dòng ghi "chưa chạy".

## Muốn biết… thì đọc

| Câu hỏi | File | Nhãn |
|---|---|---|
| Luật code bắt buộc (cấm gì, bắt buộc gì, naming, 3 role) | `INSTRUCTIONS.md` | chuẩn |
| Quy tắc chi tiết cho agent, git workflow | `docs/rules.md` | chuẩn |
| Prompt AI đang chạy (đọc lúc chạy tại `src/modules/ai/ai.service.ts`) | `docs/ai-system-prompt.md` | chuẩn |
| Quy cách kỹ thuật: format response, đặt tên, tổ chức file | `docs/spec.md` | tham khảo |
| Cấu trúc thư mục NestJS | `docs/architecture.md`; thực tế đối chiếu `src/modules/`, `src/database/` | tham khảo |
| Contract HTTP (endpoint, DTO, response) | Sự thật: `src/modules/<tên>/<tên>.controller.ts` (32 file). Swagger/Scalar ở `/api/docs` (`src/main.ts`). Danh sách viết tay: `docs/endpoint_url.md`, `docs/api_to_ui_mapping.md` | tham khảo |
| Socket.io live score | `docs/socket.md`; gateway: `src/modules/matches/live-score.gateway.ts` | tham khảo |
| Tích hợp Flutter: tournament/match, social session | `docs/tournaments-matches-flutter-integration.md`, `docs/social-sessions-flutter-integration.md` | tham khảo |
| Luồng xử lý nghiệp vụ nội bộ | `docs/business_flows.md` | tham khảo |
| Tổng quan dự án | `docs/project_overview.md`. `README.md` là mẫu NestJS, không mô tả dự án | tham khảo |
| Công nghệ và phiên bản | `package.json` (sự thật); `docs/skills.md` | tham khảo |
| Cấu trúc bảng DB, quan hệ | Mục "Cơ sở dữ liệu" bên dưới. KHÔNG dùng `docs/database_schema.md` làm nguồn | — |
| Kế hoạch mới, việc đang làm | `openspec/changes/<id>/` (tạo bằng `/opsx-propose`) | chuẩn |
| Hành vi đã chốt qua OpenSpec | `openspec/specs/` (hiện chưa có spec nào) | chuẩn |

## Cơ sở dữ liệu

Trả lời câu hỏi "đọc bản đồ DB ở đâu" và "thêm bảng/cột theo quy trình nào":

- Bản đồ DB (`docs/schema/README.md`, `npm run db:docs`) nằm ở 3 commit chưa push trên `main` cục bộ; khi đã gộp thì thay dòng này bằng link. Trên `origin/main` không có file này, không có script `db:docs`.
- Nguồn sự thật cho cấu trúc bảng là code: `src/database/schema/<nhóm>.schema.ts` (30 file nhóm, export qua `src/database/schema/index.ts`; 113 chỗ gọi `pgTable(`). `drizzle.config.ts` trỏ schema tới `src/database/schema/index.ts` và thư mục migration tới `src/database/migrations/`.
- Đổi schema: sửa `src/database/schema/<nhóm>.schema.ts` → `pnpm exec drizzle-kit generate` (quy trình trong `INSTRUCTIONS.md` và `docs/rules.md`) → dev: `pnpm db:push` (= `npx drizzle-kit push`). Chưa chạy cả hai lệnh (cần PostgreSQL).
- Production: `.github/workflows/deploy.yml` KHÔNG dùng `drizzle-kit push`. Job Deploy to VPS chạy `docker compose run --rm migrate node run-prod-migration.js --dry-run` rồi `docker compose run --rm migrate` trên VPS, rồi mới khởi động backend. Job seed chạy `seed-regions-v2.js` sau migration. Job schema-smoke chạy `node run-prod-migration.js` hai lần (kiểm lặp lại được) trên PostgreSQL 16 có PostGIS, trong CI. `pnpm db:migrate` trong `package.json` là cùng lệnh `node run-prod-migration.js`. Script này chạy mọi file .sql trong `src/database/migrations/` theo thứ tự tên (131 file; 42 mục trong `src/database/migrations/meta/_journal.json`, 89 file không có trong journal).
- `pnpm db:setup` (`package.json`) = `drizzle-kit push` rồi chạy `src/database/seeds/seed-prod.ts`. Chưa chạy; nội dung file seed chưa được đọc trong lần kiểm này.
- Migration cũ có chạy lại từ rỗng được không: **chưa xác minh** (cần PostgreSQL). Tài liệu không nói rõ. `run-prod-migration.js` tự bỏ qua lỗi "đã tồn tại" theo mã nguồn; chưa kiểm chứng bằng chạy.
- Hai đường (drizzle-kit push và run-prod-migration.js) chưa được tài liệu nào đối chiếu với nhau. `docs/rules.md` và `docs/plan.md` chỉ nhắc `drizzle-kit generate` + `push`.
- Nghiệp vụ tiền, ELO: `INSTRUCTIONS.md` yêu cầu `db.transaction()` và `SELECT ... FOR UPDATE`.

## Lệnh đã chạy thật

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `NODE_OPTIONS=--max-old-space-size=4096 pnpm exec tsc --noEmit` | 12 lỗi, tất cả trong 6 file `*.spec.ts`. Exit 2 khi chạy lần đầu (chưa có tsbuildinfo do tsc tạo trong thư mục build); exit 1 khi chạy lại (đã có buildinfo). Đã đo cả hai: xóa buildinfo rồi chạy → 2; chạy tiếp → 1 | Lỗi sẵn (baseline). Số lỗi không đổi qua các lần chạy. Chưa thử không có `NODE_OPTIONS` |
| `pnpm exec jest src/common/helpers/gender.helper.spec.ts` | exit 0; 30/30 test pass | 1 file |
| `pnpm exec eslint src/common/helpers/gender.helper.ts` | exit 0 | 1 file; không có script lint; chưa chạy toàn repo |
| `pnpm test` (jest toàn bộ, 179 file spec) | chưa chạy | |
| `pnpm build` + `pnpm test` (target `backend` trên CI) | xanh, run `39030119827` (nhánh `api-contract-tooling-20261017`, plugin swagger bật): 199/204 suite pass (5 skip), 2047 test pass, 25 skip | Không chạy ở máy |
| `pnpm openapi:export` (sau `pnpm build`) | xanh trên CI, run `39030229467`: 434 path, 507 route, 166 schema; mới 3 route có kiểu trả về | Ghi `openapi.json` ở gốc repo; preview, không cần DB/Redis |
| `pnpm test:e2e` | chưa chạy | cần DB/Docker |
| `pnpm db:push`, `pnpm db:migrate` (= `node run-prod-migration.js`), `pnpm db:setup` | chưa chạy | cần PostgreSQL |
| `npm run db:docs`, `npm run db:docs:check` | KHÔNG có trong `package.json` | |
| `openspec validate --all --strict` | exit 0; 1 change (`agent-docs-map`), 0 lỗi | Chạy sau khi tick task |
| `python C:/Users/GIGABYTE/.omp/scripts/openspec-gate.py` | exit 0: "QUA: validate strict ok, không change nào còn task dở" | Cổng gate chặn change có task chưa [x] |

## Điều cần người dùng xem

1. `README.md` là mẫu NestJS (starter), không có thông tin dự án.
2. `docs/rules.md` mục 1 bảo agent đọc `docs/database_schema.md` (ghi 36 bảng; code có 113 chỗ `pgTable(`) và `docs/apicrud.md` (kế hoạch thiết kế).
3. Hai đường migration không khớp tài liệu (xem mục Cơ sở dữ liệu).
4. `package.json` không có script `typecheck`, `lint`, `db:docs`, dù một số tài liệu và quy trình nhắc đến.
5. `.agents/rules/graphify.md` và `.agents/workflows/graphify.md` trỏ tới thư mục graphify-out; thư mục này không có trong repo.
6. `docs/refactor.md` mô tả chuyển driver từ pg sang postgres.js như kế hoạch; hiện `src/` không có file nào `from 'pg'` (0) và 8 file `from 'postgres'`. Có vẻ đã xong; chưa kiểm chi tiết.
7. `docs/plan.md` còn mục chưa tick `[ ] Chạy drizzle-kit generate + drizzle-kit push`.
8. `ripwire doc_drift` (path = gốc worktree) báo 8 anchor không còn khớp; cần xem, không kết luận tài liệu sai: `docs/prompt.md` ghi `setsToWin = 2` và `= 3`, code `src/modules/matches/utils/score-validation/validate-football-score.ts:146` là `= 1`; `docs/admin_system_redesign_plan.md` nhắc `PayoutsService` không có định nghĩa trong code; `docs/division_tournament.md` (3) và `docs/fix.md` (1) trỏ tới file trang Web quản lý không có trong repo này; `docs/rules.md` báo `PascalCase` là báo nhầm (không phải symbol). Tool báo 49 file Markdown, git theo dõi 37; nguyên nhân chênh lệch chưa kiểm.
9. Xung đột luật: `D:/Duancanhan/Project_QuanLyGiaiDau/AGENTS.md` (block Web App Factory, dòng 16) yêu cầu dùng `D:/Duancanhan/Project_QuanLyGiaiDau/workflow/harness/new-change.ps1` để tạo `changes/<change-id>/` cho mọi thay đổi. Repo này dùng OpenSpec theo yêu cầu thiết lập (`openspec/changes/<id>/`). Chưa có người dùng chốt chuẩn nào; cần chốt trước khi dùng OpenSpec làm nơi ghi kế hoạch chính thức.

## Nơi ghi tài liệu mới

- Kế hoạch / spec cho một thay đổi: `openspec/changes/<id>/`. KHÔNG tạo `*_PLAN.md`, `*_SPEC.md` trong `docs/`.
- Kiến thức lâu dài: sửa tài liệu chuẩn hoặc tham khảo ở bảng trên, cập nhật nhãn trong cùng commit.
- Kiểm tài liệu lệch code: ripwire `doc_drift` với `path` = gốc repo.

## Nhãn từng file Markdown theo dõi (37 file trên `origin/main`, cộng 2 file của nhánh này)

| File | Nhãn | Ghi chú |
|---|---|---|
| `AGENTS.md` | chuẩn | Bảng chỉ đường cho agent (≤40 dòng); omp tự nạp ở gốc repo |
| `docs/README.md` | chuẩn | Bản đồ này: câu hỏi → file, nhãn, mục DB, lệnh đã chạy |
| `INSTRUCTIONS.md` | chuẩn | Luật bắt buộc; thắng khi mâu thuẫn |
| `README.md` | tham khảo | Mẫu NestJS, không mô tả dự án |
| `.agents/rules/graphify.md` | tham khảo | Công cụ agent; thư mục graphify-out không có trong repo |
| `.agents/workflows/graphify.md` | tham khảo | Công cụ agent; như trên |
| `docs/rules.md` | chuẩn | Quy tắc đầy đủ + git workflow; mục 1 nhắc đọc `docs/database_schema.md` (kế hoạch cũ) |
| `docs/ai-system-prompt.md` | chuẩn | Prompt AI đọc lúc chạy (`src/modules/ai/ai.service.ts:434`); `scripts/copy-ai-prompt.js` chép bản này sang thư mục build (dist) khi build |
| `docs/spec.md` | tham khảo | Quy cách kỹ thuật; đối chiếu code |
| `docs/architecture.md` | tham khảo | Cấu trúc thư mục NestJS mô tả khái quát |
| `docs/skills.md` | tham khảo | Bản đồ 8 kỹ năng công nghệ |
| `docs/skills_architect.md` | tham khảo | Vai trò Architect cho agent |
| `docs/skills_coder.md` | tham khảo | Vai trò Coder cho agent |
| `docs/skills_tester.md` | tham khảo | Vai trò Tester cho agent |
| `docs/ai-system-prompt-vnsport-tournament-guide.md` | tham khảo | Không có code nào đọc (grep `src/`, `scripts/`: 0); chưa rõ dùng ở đâu, không coi là prompt đang chạy |
| `docs/database_schema.md` | kế hoạch cũ | Ghi "SQL schema 36 bảng"; code có 113 chỗ `pgTable(`. Không dùng làm cấu trúc bảng |
| `docs/database_relationships.md` | kế hoạch cũ | Ghi "36 bảng" (dòng 8); không dùng làm nguồn quan hệ |
| `docs/database_evaluation.md` | kế hoạch cũ | Đánh giá schema "V3" tại một thời điểm |
| `docs/apicrud.md` | kế hoạch cũ | Kế hoạch thiết kế API CRUD; contract thật là controller |
| `docs/endpoint_url.md` | tham khảo | Danh sách URL viết tay; đối chiếu controller |
| `docs/api_to_ui_mapping.md` | tham khảo | Đặc tả API ↔ UI; đối chiếu controller và Web |
| `docs/socket.md` | tham khảo | Hướng dẫn Socket.io live score |
| `docs/tournaments-matches-flutter-integration.md` | tham khảo | Tích hợp Flutter cho tournament/match |
| `docs/social-sessions-flutter-integration.md` | tham khảo | Tích hợp Flutter cho social session |
| `docs/social-location-geocoding.md` | tham khảo | Ghi chú triển khai geocoding và route social-locations |
| `docs/project_overview.md` | tham khảo | Tổng quan dự án |
| `docs/business_flows.md` | tham khảo | Luồng nghiệp vụ nội bộ; đối chiếu code |
| `docs/plan.md` | kế hoạch cũ | Kế hoạch phát triển theo phase; còn mục chưa tick |
| `docs/phase5-plan.md` | kế hoạch cũ | Kế hoạch Phase 5 |
| `docs/prompt.md` | kế hoạch cũ | Prompt cho AI agent triển khai Phase 5; có anchor lệch (xem trên) |
| `docs/backend-continue-prompt.md` | kế hoạch cũ | Prompt tiếp tục xây backend (Phase 2) |
| `docs/fix.md` | kế hoạch cũ | Fix plan bracket theo division, ngày 2026-06-18 |
| `docs/refactor.md` | kế hoạch cũ | Kế hoạch chuyển driver từ pg sang postgres.js; có vẻ đã xong (xem trên) |
| `docs/oauth2-plan.md` | kế hoạch cũ | Kế hoạch OAuth 2.0 multi-provider |
| `docs/admin_system_redesign_plan.md` | kế hoạch cũ | Kế hoạch tái cấu trúc admin |
| `docs/division_tournament.md` | kế hoạch cũ | Hiện trạng và việc còn lại (checklist); có anchor lệch |
| `docs/organizer-ops-panel-roadmap.md` | kế hoạch cũ | MVP roadmap |
| `docs/organizer-ops-panel-gap-analysis.md` | kế hoạch cũ | So sánh hiện trạng tại một thời điểm |
| `docs/organizer-ops-panel-system-map.md` | tham khảo | Bản đồ hệ thống ops panel; đối chiếu code |
